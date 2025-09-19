import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { NetworkingStack } from './networking-stack';
import { config } from '../config';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class ApiStack extends Construct {
    public readonly service: ecs.Ec2Service;
    public readonly alb: elbv2.ApplicationLoadBalancer;
    public readonly targetGroup: elbv2.ApplicationTargetGroup;
    public readonly listener: elbv2.ApplicationListener;
    public readonly fileBucket: s3.Bucket;
    public readonly smsTopic: sns.Topic;
    public readonly pushTopic: sns.Topic;

    constructor(scope: Construct, id: string, networking: NetworkingStack, hostedZone: route53.IHostedZone) {
        super(scope, id);

        // Create S3 bucket for API file storage
        this.fileBucket = new s3.Bucket(this, 'ApiFileBucket', {
            bucketName: 'whattodos-user-files',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
        });

        // Create Task Role
        const taskRole = new iam.Role(this, 'TaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });

        // Add SSM permissions to task role
        taskRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
        );

        // Add S3 permissions to task role
        taskRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
                's3:GetBucketLocation',
                's3:ListAllMyBuckets',
                's3:GetBucketPolicy',
                's3:PutBucketPolicy'
            ],
            resources: [
                `arn:aws:s3:::${this.fileBucket.bucketName}`,
                `arn:aws:s3:::${this.fileBucket.bucketName}/*`,
                `arn:aws:s3:::whattodos-api-build-artifacts-${cdk.Stack.of(this).account}`,
                `arn:aws:s3:::whattodos-api-build-artifacts-${cdk.Stack.of(this).account}/*`
            ]
        }));

        // Add SNS permissions to task role
        taskRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                'sns:GetSMSAttributes',
                'sns:SetSMSAttributes',
                'sns:Publish'
            ],
            resources: ['*']
        }));

        // Add SMS Voice permissions to task role
        taskRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                'sms-voice:DescribeSpendLimits',
                'sms-voice:DescribeAccountAttributes',
                'sms-voice:DescribeAccountLimits'
            ],
            resources: ['*']
        }));

        // Add bucket policy to allow access from ECS task role
        this.fileBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ArnPrincipal(taskRole.roleArn)],
            actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
                's3:GetBucketLocation'
            ],
            resources: [
                this.fileBucket.bucketArn,
                `${this.fileBucket.bucketArn}/*`
            ]
        }));

        // Create ECS Cluster
        const cluster = new ecs.Cluster(this, 'ApiCluster', {
            vpc: networking.vpc,
            containerInsights: true,
        });

        // Add EC2 capacity to the cluster
        cluster.addCapacity('DefaultAutoScalingGroup', {
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO), // Upgraded from MICRO
            minCapacity: 1,
            maxCapacity: 2,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            machineImage: ecs.EcsOptimizedImage.amazonLinux2()
        });

        // Create Task Execution Role
        const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
            ],
        });

        // Create Task Definition
        const taskDefinition = new ecs.Ec2TaskDefinition(this, 'ApiTaskDef', {
            networkMode: ecs.NetworkMode.AWS_VPC,
            executionRole: taskExecutionRole,
            taskRole: taskRole,
        });

        // Create SNS topics
        this.smsTopic = new sns.Topic(this, 'SmsTopic', {
            displayName: 'WhatToDos SMS Notifications',
            topicName: 'whattodos-sms-notifications'
        });

        this.pushTopic = new sns.Topic(this, 'PushTopic', {
            displayName: 'WhatToDos Push Notifications',
            topicName: 'whattodos-push-notifications'
        });

        // Add SMS permissions to task role
        taskRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                'sns:Publish',
                'sns:SetSMSAttributes',
                'sns:GetSMSAttributes'
            ],
            resources: [
                this.smsTopic.topicArn,
                this.pushTopic.topicArn
            ]
        }));

        // Add environment variables for SNS topics
        const containerEnvironment = {
            NODE_ENV: 'production',
            PORT: '3000',
            DB_HOST: networking.dbInstance.dbInstanceEndpointAddress,
            DB_PORT: networking.dbInstance.dbInstanceEndpointPort.toString(),
            DB_NAME: 'whattodos',
            DB_USER: 'whattodos',
            DB_PASSWORD: 'whattodos123',
            REDIS_HOST: networking.redisCluster.attrRedisEndpointAddress,
            REDIS_PORT: '6379',
            AWS_REGION: cdk.Stack.of(this).region,
            AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
            AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
            BUILD_ARTIFACTS_BUCKET: `whattodos-api-build-artifacts-${cdk.Stack.of(this).account}`,
            AWS_S3_BUCKET: this.fileBucket.bucketName,
            SMS_TOPIC_ARN: this.smsTopic.topicArn,
            PUSH_TOPIC_ARN: this.pushTopic.topicArn
        };

        // Add container to task definition
        taskDefinition.addContainer('ApiContainer', {
            image: ecs.ContainerImage.fromRegistry('node:20-alpine'),
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'api',
                logGroup: new logs.LogGroup(this, 'ApiContainerLogGroup', {
                    logGroupName: 'ServerCdkStack-ApiStackApiTaskDefApiContainerLogGroup',
                    retention: logs.RetentionDays.ONE_WEEK,
                    removalPolicy: cdk.RemovalPolicy.DESTROY,
                }),
            }),
            workingDirectory: '/app',
            portMappings: [
                {
                    containerPort: 3000,
                    hostPort: 3000,
                    protocol: ecs.Protocol.TCP,
                },
            ],
            memoryLimitMiB: 512,
            memoryReservationMiB: 256,
            environment: containerEnvironment,
            // Container health check disabled - using ALB target group health check instead
            // healthCheck: {
            //     command: [
            //         'CMD-SHELL',
            //         'wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1',
            //     ],
            //     interval: cdk.Duration.seconds(30),
            //     timeout: cdk.Duration.seconds(5),
            //     retries: 3,
            //     startPeriod: cdk.Duration.seconds(60),
            // },
            command: [
                'sh',
                '-c',
                `
                # Install dependencies
                apk add --no-cache wget curl aws-cli

                # Check AWS profile and credentials
                echo "=== AWS Profile ==="
                aws configure list
                echo "=== AWS Profile Details ==="
                aws configure get aws_access_key_id
                aws configure get aws_secret_access_key
                aws configure get region
                echo "=== Current AWS Identity ==="
                aws sts get-caller-identity
                echo "=== Testing S3 Access ==="
                aws s3api head-bucket --bucket whattodos-user-files || echo "Failed to access bucket"
                aws s3 ls s3://whattodos-user-files || echo "Failed to list bucket contents"

                # Try to download files from S3
                echo "Attempting to download build artifacts from S3..."
                if aws s3 ls s3://$BUILD_ARTIFACTS_BUCKET/package.json > /dev/null 2>&1; then
                    echo "Found build artifacts in S3, downloading..."
                    aws s3 cp s3://$BUILD_ARTIFACTS_BUCKET/dist ./dist --recursive || { echo "Failed to download dist directory"; exit 1; }
                    aws s3 cp s3://$BUILD_ARTIFACTS_BUCKET/package.json . || { echo "Failed to download package.json"; exit 1; }
                    aws s3 cp s3://$BUILD_ARTIFACTS_BUCKET/package-lock.json . || { echo "Failed to download package-lock.json"; exit 1; }
                    aws s3 cp s3://$BUILD_ARTIFACTS_BUCKET/.env . || { echo "Failed to download .env"; exit 1; }
                    aws s3 cp s3://$BUILD_ARTIFACTS_BUCKET/taskdef.json . || { echo "Failed to download taskdef.json"; exit 1; }
                    echo "Starting application..."
                    npm install --production || { echo "Failed to install dependencies"; exit 1; }
                    echo "Running database migrations..."
                    npx typeorm-ts-node-commonjs -d ./dist/config/database.js migration:run || { echo "Failed to run migrations"; exit 1; }
                    echo "Starting app.js..."
                    node dist/app.js || { echo "Failed to start application"; exit 1; }
                else
                    echo "No build artifacts found in S3, starting health check server..."
                    # Create a minimal health check server
                    echo 'const http = require("http");
                    const server = http.createServer((req, res) => {
                        if (req.url === "/health") {
                            res.writeHead(200);
                            res.end("OK");
                        } else {
                            res.writeHead(404);
                            res.end();
                        }
                    });
                    server.listen(3000);' > server.js
                    node server.js
                fi
                `
            ]
        });

        // Create Application Load Balancer
        this.alb = new elbv2.ApplicationLoadBalancer(this, 'ApiAlb', {
            vpc: networking.vpc,
            internetFacing: true,
            securityGroup: networking.albSecurityGroup,
        });

        // Create Target Group
        this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
            vpc: networking.vpc,
            port: 3000,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/health',
                interval: cdk.Duration.seconds(60),
                timeout: cdk.Duration.seconds(5),
                healthyHttpCodes: '200',
                unhealthyThresholdCount: 2,
                healthyThresholdCount: 2
            },
        });

        // Create SSL Certificate
        const certificate = new acm.Certificate(this, 'ApiCertificate', {
            domainName: `${config.domain.apiSubdomain}.${config.domain.name}`,
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });

        // Add HTTPS listener
        this.listener = this.alb.addListener('HttpsListener', {
            port: 443,
            certificates: [certificate],
            open: true,
        });

        this.listener.addTargetGroups('DefaultRoute', {
            targetGroups: [this.targetGroup],
        });

        // Create ECS Service
        this.service = new ecs.Ec2Service(this, 'ApiService', {
            cluster,
            taskDefinition,
            desiredCount: config.ecs.task.desiredCount,
            securityGroups: [networking.taskSecurityGroup],
            assignPublicIp: false,
        });

        // Attach service to target group
        this.service.attachToApplicationTargetGroup(this.targetGroup);

        // Create A record for API
        new route53.ARecord(this, 'ApiAliasRecord', {
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(
                new targets.LoadBalancerTarget(this.alb)
            ),
            recordName: `${config.domain.apiSubdomain}.${config.domain.name}`,
        });

        // Output the ALB DNS name
        new cdk.CfnOutput(this, 'AlbDnsName', {
            value: this.alb.loadBalancerDnsName,
        });

        // Output SNS topic ARNs
        new cdk.CfnOutput(this, 'SmsTopicArn', {
            value: this.smsTopic.topicArn,
            description: 'SNS Topic ARN for SMS notifications'
        });

        new cdk.CfnOutput(this, 'PushTopicArn', {
            value: this.pushTopic.topicArn,
            description: 'SNS Topic ARN for push notifications'
        });
    }
} 