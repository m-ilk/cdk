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
            desiredCount: number;
        };
        container: {
            port: number;
        };
    };
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
            desiredCount: 1,
        },
        container: {
            port: 3000,
        },
    },
    environment: 'production',
}; 