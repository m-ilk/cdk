#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ServerCdkStack } from '../lib/server-cdk-stack';

const app = new cdk.App();
new ServerCdkStack(app, 'ServerCdkStack', {
    env: { 
        account: process.env.CDK_DEFAULT_ACCOUNT, 
        region: process.env.CDK_DEFAULT_REGION 
    },
    description: 'Infrastructure for whattodos',
});