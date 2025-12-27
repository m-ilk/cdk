import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { NetworkingStack } from './constructs/networking-stack';
import { WebsiteStack } from './constructs/website-stack';
import { ApiStack } from './constructs/api-stack';
import { PipelineStack } from './constructs/pipeline-stack';
import { config } from './config';

export class ServerCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Add tags to all resources
    cdk.Tags.of(this).add('Project', 'WhatToDos');
    cdk.Tags.of(this).add('Environment', config.environment);

    // Create hosted zone
    const hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: config.domain.name,
      comment: 'Hosted zone for WhatToDos application',
    });

    const whale2goHostedZone = new route53.HostedZone(this, 'Whale2GoHostedZone', {
      zoneName: 'whale2go.com',
      comment: 'Hosted zone for Whale2Go application',
    });

    // Create networking resources
    const networking = new NetworkingStack(this, 'NetworkingStack');

    // Create website resources
    const website = new WebsiteStack(this, 'WebsiteStack', whale2goHostedZone);

    // Create API resources
    const api = new ApiStack(this, 'ApiStack', networking, hostedZone);

    // Create pipeline resources
    new PipelineStack(
        this, 
        'PipelineStack', 
        website.bucket, 
        networking,
        api,
        'main'
    );

    // Output the nameservers
    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', hostedZone.hostedZoneNameServers || []),
      description: 'Nameservers for the hosted zone. Update these in your GoDaddy DNS settings.',
    });

    // Output the hosted zone ID
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: hostedZone.hostedZoneId,
      description: 'Hosted Zone ID for Route 53',
    });
  }
}
