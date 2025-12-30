import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { config } from '../config';
import { NetworkingStack } from './networking-stack';
import { ApiStack } from './api-stack';

const GITHUB_TOKEN_SECRET_NAME = 'github-token';

export class PipelineStack extends Construct {
    private readonly api: ApiStack;

    constructor(
        scope: Construct, 
        id: string, 
        websiteBucket: s3.Bucket,
        networking: NetworkingStack,
        api: ApiStack,
        branch: string
    ) {
        super(scope, id);
        this.api = api;

        // Create Website Pipeline
        const websitePipeline = new codepipeline.Pipeline(this, 'WebsitePipeline', {
            pipelineName: 'WhatToDosWebsiteDeployment',
            crossAccountKeys: false,
        });

        // Website source stage
        const websiteSourceOutput = new codepipeline.Artifact();
        const websiteSourceAction = new codepipeline_actions.GitHubSourceAction({
            actionName: 'Website-Source',
            owner: 'whattodos',
            repo: 'landing-page',
            branch,
            oauthToken: cdk.SecretValue.secretsManager(GITHUB_TOKEN_SECRET_NAME),
            output: websiteSourceOutput,
        });
        websitePipeline.addStage({
            stageName: 'Source',
            actions: [websiteSourceAction],
        });

        // Website build stage
        const websiteBuild = new codebuild.PipelineProject(this, 'WebsiteBuild', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
            environment: {
            buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
            privileged: false,
            environmentVariables: {
                NODE_ENV: {
                value: config.environment,
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                }
            }
            }
        });

        const websiteBuildOutput = new codepipeline.Artifact();
        const websiteBuildAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'Build_Website',
            project: websiteBuild,
            input: websiteSourceOutput,
            outputs: [websiteBuildOutput],
        });

        websitePipeline.addStage({
            stageName: 'Build',
            actions: [websiteBuildAction],
        });

        // Website deploy stage
        const websiteDeployAction = new codepipeline_actions.S3DeployAction({
            actionName: 'Deploy_Website',
            input: websiteBuildOutput,
            bucket: websiteBucket,
        });

        websitePipeline.addStage({
            stageName: 'Deploy',
            actions: [websiteDeployAction],
        });

        // Create API Pipeline
        const apiPipeline = new codepipeline.Pipeline(this, 'ApiPipeline', {
            pipelineName: 'WhatToDosApiDeployment',
            crossAccountKeys: false,
        });

        // Create S3 bucket for build artifacts
        const buildArtifactsBucket = new s3.Bucket(this, 'ApiBuildArtifacts', {
            bucketName: `whattodos-api-build-artifacts-${cdk.Stack.of(this).account}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        // API source stage
        const apiSourceOutput = new codepipeline.Artifact();
        const apiSourceAction = new codepipeline_actions.GitHubSourceAction({
            actionName: 'API-Source',
            owner: 'whattodos',
            repo: 'fungi-api',
            branch: 'develop',
            oauthToken: cdk.SecretValue.secretsManager(GITHUB_TOKEN_SECRET_NAME),
            output: apiSourceOutput,
        });
        apiPipeline.addStage({
            stageName: 'Source',
            actions: [apiSourceAction],
        });

        // API build stage
        const apiBuild = new codebuild.PipelineProject(this, 'ApiBuild', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
                privileged: true,  // Required for Docker
                environmentVariables: {
                    NODE_ENV: {
                        value: config.environment,
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    AWS_ACCOUNT_ID: {
                        value: cdk.Stack.of(this).account,
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    AWS_REGION: {
                        value: cdk.Stack.of(this).region,
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    //todo use cdk to create sns
                    AWS_SNS_IOS_PLATFORM_ARN: {
                        value: 'arn:aws:sns:us-east-1:716641879475:app/APNS/whale2go-ios-production',
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    REDIS_HOST: {
                        value: networking.redisCluster.attrRedisEndpointAddress,
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    DB_HOST: {
                        value: networking.dbInstance.dbInstanceEndpointAddress,
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    GOOGLE_API_KEY: {
                        value: cdk.SecretValue.secretsManager('google-api-key').unsafeUnwrap(),
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    BUILD_ARTIFACTS_BUCKET: {
                        value: buildArtifactsBucket.bucketName,
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    AWS_S3_BUCKET: {
                        value: this.api.fileBucket.bucketName,
                        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
                    }
                }
            }
        });

        // Grant build project access to S3 bucket
        buildArtifactsBucket.grantReadWrite(apiBuild);

        const apiBuildOutput = new codepipeline.Artifact();
        const apiBuildAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'Build_API',
            project: apiBuild,
            input: apiSourceOutput,
            outputs: [apiBuildOutput],
        });

        apiPipeline.addStage({
            stageName: 'Build',
            actions: [apiBuildAction],
        });

        // API deploy stage
        const apiDeployAction = new codepipeline_actions.EcsDeployAction({
            actionName: 'DeployToECS',
            service: this.api.service,
            input: apiBuildOutput
        });

        apiPipeline.addStage({
            stageName: 'Deploy',
            actions: [apiDeployAction],
        });
    }
} 