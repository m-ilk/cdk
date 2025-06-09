import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { config } from '../config';

export class NetworkingStack extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly taskSecurityGroup: ec2.SecurityGroup;
  public readonly redisCluster: elasticache.CfnCacheCluster;
  public readonly dbInstance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Create VPC with specific CIDR and subnet configuration
    this.vpc = new ec2.Vpc(this, 'ApiVpc', {
      maxAzs: config.vpc.maxAzs,
      natGateways: config.vpc.natGateways,
      cidr: config.vpc.cidr,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Add tags to VPC
    cdk.Tags.of(this.vpc).add('Name', 'WhatToDos-VPC');
    cdk.Tags.of(this.vpc).add('Environment', config.environment);

    // Create Security Group for ALB
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: 'Security group for API ALB',
    });
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP');
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS');

    // Add tags to ALB security group
    cdk.Tags.of(this.albSecurityGroup).add('Name', 'WhatToDos-ALB-SG');
    cdk.Tags.of(this.albSecurityGroup).add('Environment', config.environment);

    // Create Security Group for ECS Tasks
    this.taskSecurityGroup = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: 'Security group for API ECS tasks',
    });
    this.taskSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(config.ecs.container.port), 'Allow from ALB');

    // Add tags to task security group
    cdk.Tags.of(this.taskSecurityGroup).add('Name', 'WhatToDos-Task-SG');
    cdk.Tags.of(this.taskSecurityGroup).add('Environment', config.environment);

    // Create Redis Subnet Group
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis cluster',
      subnetIds: this.vpc.privateSubnets.map(subnet => subnet.subnetId),
    });

    // Create Redis Security Group
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Redis cluster',
      allowAllOutbound: true,
    });

    // Allow inbound Redis traffic from ECS tasks
    redisSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.taskSecurityGroup.securityGroupId),
      ec2.Port.tcp(6379),
      'Allow Redis access from ECS tasks'
    );

    // Create Redis Cluster
    this.redisCluster = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      engine: 'redis',
      cacheNodeType: 'cache.t3.micro',
      numCacheNodes: 1,
      port: 6379,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
      engineVersion: '7.0',
    });

    // Create RDS Security Group
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for RDS MySQL instance',
      allowAllOutbound: true,
    });

    // Allow inbound MySQL traffic from ECS tasks
    dbSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.taskSecurityGroup.securityGroupId),
      ec2.Port.tcp(3306),
      'Allow MySQL access from ECS tasks'
    );

    // Create IAM role for Session Manager
    const sessionManagerRole = new iam.Role(this, 'SessionManagerRole', {
      assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonRDSDataFullAccess')
      ]
    });

    // Create security group for database access instance
    const dbAccessSecurityGroup = new ec2.SecurityGroup(this, 'DbAccessSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for database access instance',
      allowAllOutbound: true,
    });

    // Create EC2 instance for database access
    const dbAccessInstance = new ec2.Instance(this, 'DbAccessInstance', {
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: dbAccessSecurityGroup,
      role: sessionManagerRole,
    });

    // Allow RDS access from the database access instance
    dbSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(dbAccessSecurityGroup.securityGroupId),
      ec2.Port.tcp(3306),
      'Allow MySQL access from database access instance'
    );

    // Create RDS MySQL Instance
    this.dbInstance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0,
      }),
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      securityGroups: [dbSecurityGroup],
      databaseName: 'whattodos',
      credentials: rds.Credentials.fromUsername('whattodos', {
        password: cdk.SecretValue.unsafePlainText('whattodos123')
      }),
      backupRetention: cdk.Duration.days(7),
      multiAz: false,
      autoMinorVersionUpgrade: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    // Add tags to RDS instance
    cdk.Tags.of(this.dbInstance).add('Name', 'WhatToDos-DB');
    cdk.Tags.of(this.dbInstance).add('Environment', config.environment);

    // Output VPC ID
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
    });

    // Output RDS endpoint
    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.dbInstance.dbInstanceEndpointAddress,
      description: 'RDS MySQL endpoint',
    });
  }
} 