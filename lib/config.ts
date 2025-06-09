export interface Config {
  // Domain configuration
  domain: {
    name: string;
    apiSubdomain: string;
    wwwSubdomain: string;
  };

  // VPC configuration
  vpc: {
    cidr: string;
    maxAzs: number;
    natGateways: number;
  };

  // ECS configuration
  ecs: {
    task: {
      cpu: number;
      memoryLimitMiB: number;
      desiredCount: number;
      minCapacity: number;
      maxCapacity: number;
    };
    container: {
      port: number;
      healthCheckPath: string;
    };
  };

  // Auto-scaling configuration
  autoScaling: {
    cpuTargetUtilizationPercent: number;
    memoryTargetUtilizationPercent: number;
    scaleInCooldown: number;
    scaleOutCooldown: number;
  };

  // CloudWatch alarms configuration
  alarms: {
    cpuThreshold: number;
    memoryThreshold: number;
    evaluationPeriods: number;
    datapointsToAlarm: number;
  };

  // Environment
  environment: string;
}

export const config: Config = {
  domain: {
    name: 'whattodos.com',
    apiSubdomain: 'api',
    wwwSubdomain: 'www',
  },

  vpc: {
    cidr: '10.0.0.0/16',
    maxAzs: 2,
    natGateways: 1,
  },

  ecs: {
    task: {
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      minCapacity: 1,
      maxCapacity: 1,
    },
    container: {
      port: 3000,
      healthCheckPath: '/health',
    },
  },

  autoScaling: {
    cpuTargetUtilizationPercent: 70,
    memoryTargetUtilizationPercent: 70,
    scaleInCooldown: 60,
    scaleOutCooldown: 60,
  },

  alarms: {
    cpuThreshold: 80,
    memoryThreshold: 80,
    evaluationPeriods: 3,
    datapointsToAlarm: 2,
  },

  environment: 'production',
}; 