# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template



# WhatToDos API Infrastructure

This repository contains the AWS CDK infrastructure code for the WhatToDos API service. The infrastructure is built using AWS CDK and TypeScript.

## Architecture Overview

The infrastructure consists of several key components:

### Networking Layer
- VPC with public and private subnets across 2 AZs
- NAT Gateway for outbound internet access
- Security Groups for ALB, ECS tasks, RDS, and Redis

### Database Layer
- RDS MySQL instance (t3.micro)
  - Publicly accessible
  - Automated backups enabled
  - Multi-AZ disabled (for cost optimization)
- Redis Cluster (cache.t3.micro)
  - For session management and caching
  - Located in private subnets

### Application Layer
- ECS Cluster with EC2 launch type
- Application Load Balancer (ALB)
  - HTTPS enabled with ACM certificate
  - Health checks configured
- ECS Service
  - Task definition with Node.js container
  - Auto-scaling configured
  - Health check endpoint

### Storage Layer
- S3 Bucket for user files
- S3 Bucket for build artifacts

### CI/CD Pipeline
- CodePipeline for automated deployments
- CodeBuild for building and testing
- GitHub integration for source code
- Automated deployment to ECS

### Monitoring and Logging
- CloudWatch Logs for container logs
- CloudWatch Alarms for monitoring
- X-Ray for tracing (optional)

## Infrastructure Diagram

```mermaid
graph TD
    %% AWS Services
    subgraph "AWS Cloud"
        subgraph "Networking"
            VPC[VPC]
            PublicSubnet1[Public Subnet AZ1]
            PublicSubnet2[Public Subnet AZ2]
            PrivateSubnet1[Private Subnet AZ1]
            PrivateSubnet2[Private Subnet AZ2]
            NAT[NAT Gateway]
            IGW[Internet Gateway]
            ALB[Application Load Balancer]
            RouteTable[Route Tables]
        end

        subgraph "Compute & Container"
            ECS[ECS Cluster]
            EC2[EC2 Instances]
            Task[ECS Task]
            Container[Node.js Container]
            AutoScaling[Auto Scaling Group]
        end

        subgraph "Database"
            RDS[(RDS MySQL)]
            ReadReplica[(Read Replica)]
            Redis[(ElastiCache Redis)]
            ParameterStore[Systems Manager Parameter Store]
        end

        subgraph "Storage"
            S3Files[S3 - User Files]
            S3Build[S3 - Build Artifacts]
            EFS[EFS - Shared Storage]
        end

        subgraph "Security"
            ACM[ACM Certificate]
            WAF[WAF]
            SecretsManager[Secrets Manager]
            IAM[IAM Roles]
        end

        subgraph "CI/CD"
            Pipeline[CodePipeline]
            Build[CodeBuild]
            GitHub[GitHub]
            CodeDeploy[CodeDeploy]
        end

        subgraph "Monitoring"
            CloudWatch[CloudWatch]
            XRay[X-Ray]
            Alarms[CloudWatch Alarms]
            Logs[CloudWatch Logs]
        end
    end

    %% External Services
    Internet((Internet))
    GitHub((GitHub))
    CDN[CloudFront CDN]

    %% Connections
    Internet --> CDN
    CDN --> WAF
    WAF --> ALB
    ALB --> ECS
    ECS --> Task
    Task --> Container

    %% Networking Connections
    Internet --> IGW
    IGW --> PublicSubnet1
    IGW --> PublicSubnet2
    PublicSubnet1 --> ALB
    PublicSubnet2 --> ALB
    PublicSubnet1 --> NAT
    PublicSubnet2 --> NAT
    NAT --> PrivateSubnet1
    NAT --> PrivateSubnet2

    %% Database Connections
    Container --> RDS
    Container --> ReadReplica
    Container --> Redis
    Container --> ParameterStore

    %% Storage Connections
    Container --> S3Files
    Container --> S3Build
    Container --> EFS

    %% Security Connections
    ACM --> ALB
    SecretsManager --> Container
    IAM --> Task
    IAM --> Build

    %% CI/CD Connections
    GitHub --> Pipeline
    Pipeline --> Build
    Build --> S3Build
    Build --> CodeDeploy
    CodeDeploy --> ECS

    %% Monitoring Connections
    Container --> CloudWatch
    Container --> XRay
    CloudWatch --> Alarms
    Container --> Logs

    %% Auto Scaling
    AutoScaling --> ECS
    Alarms --> AutoScaling

    %% Styling
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:white;
    classDef external fill:#666,stroke:#333,stroke-width:2px,color:white;
    class VPC,PublicSubnet1,PublicSubnet2,PrivateSubnet1,PrivateSubnet2,NAT,IGW,ALB,RouteTable aws;
    class Internet,GitHub,CDN external;
```

This diagram shows:
- All major AWS services used in the infrastructure
- How services are connected and interact
- Security boundaries and access patterns
- Data flow between components
- Monitoring and logging setup
- CI/CD pipeline integration

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 20.x or later
- AWS CDK installed globally
- TypeScript 4.x or later

## Environment Variables

Required environment variables:
```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
GITHUB_TOKEN=your_github_token
```

## Deployment

1. Install dependencies:
```bash
npm install
```

2. Bootstrap CDK (first time only):
```bash
cdk bootstrap
```

3. Deploy the stack:
```bash
cdk deploy --all
```

## Cost Optimization

- Using t3.micro instances for RDS and Redis
- Single NAT Gateway
- Multi-AZ disabled for RDS
- Auto-scaling configured for cost efficiency

## Security

- All sensitive data stored in AWS Secrets Manager
- HTTPS enabled for all external communications
- Security groups restrict access to necessary ports only
- IAM roles follow principle of least privilege

## Monitoring

- CloudWatch Logs for container logs
- CloudWatch Alarms for:
  - CPU utilization
  - Memory utilization
  - Disk space
  - Error rates

## Backup and Recovery

- RDS automated backups enabled
- S3 versioning enabled for user files
- ECS task definitions versioned

## Maintenance

- Regular security updates
- Database maintenance windows configured
- Automated backups
- Log rotation configured

## Troubleshooting

Common issues and solutions:
1. Database connection issues
   - Check security group rules
   - Verify database credentials
   - Check VPC connectivity

2. Container startup issues
   - Check CloudWatch logs
   - Verify environment variables
   - Check task definition

3. Deployment failures
   - Check CodeBuild logs
   - Verify GitHub token
   - Check IAM permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.