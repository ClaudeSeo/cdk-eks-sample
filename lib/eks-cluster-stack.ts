import { InstanceType, InstanceClass, InstanceSize, Vpc, VpcProps, SubnetType } from '@aws-cdk/aws-ec2'
import { AutoScalingGroup, UpdateType } from '@aws-cdk/aws-autoscaling';
import { Cluster, EksOptimizedImage, NodeType } from '@aws-cdk/aws-eks';
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal, AccountRootPrincipal } from '@aws-cdk/aws-iam';
import { App, CfnOutput, Stack, StackProps } from '@aws-cdk/core';

export interface Props extends StackProps {
  clusterName: string;
}

export class EksClusterStack extends Stack {
  constructor(scope: App, id: string, props: Props) {
    super(scope, id, props);
    const { clusterName } = props;
    const vpc = this.createVpc();
    const clusterRole = this.createClusterRole();
    const clusterAdminRole = this.createClusterAdminRole();
    const cluster = this.createCluster(clusterName, vpc, clusterAdminRole, clusterRole);

    new CfnOutput(this, 'clusterRole', {
      value: cluster.clusterArn,
    });

    new CfnOutput(this, 'clusterName', {
      value: clusterName,
    });
  }

  private createVpc(): Vpc {
    const vpcProps: VpcProps = {
      cidr: '10.0.0.0/16',
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          subnetType: SubnetType.PUBLIC,
          name: 'eks-cluster-public',
        },
        {
          subnetType: SubnetType.PRIVATE,
          name: 'eks-cluster-private',
        }
      ]
    }

    return new Vpc(this, 'eks-vpc', vpcProps);
  }

  private createClusterRole(): Role {
    const clusterRole = new Role(this, 'eks-cluster-role', {
      assumedBy: new ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSServicePolicy'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });

    clusterRole.addToPolicy(
      new PolicyStatement({
        actions: [
          'elasticloadbalancing:*',
          'ec2:CreateSecurityGroup',
          'ec2:Describe*',
        ],
        resources: ['*'],
      }),
    );

    return clusterRole;
  }

  private createClusterAdminRole(): Role {
    return new Role(this, 'eks-cluster-admin-role', {
      roleName: 'kubernetesAdmin',
      assumedBy: new AccountRootPrincipal(),
    }); 
  }

  private createCluster(clusterName: string, vpc: Vpc, clusterAdminRole: Role, clusterRole: Role): Cluster {
    const cluster = new Cluster(this, clusterName, {
      vpc,
      clusterName,
      role: clusterRole,
      mastersRole: clusterAdminRole,
      defaultCapacity: 0,
    });

    const asg = new AutoScalingGroup(this, `${clusterName}-asg`, {
        vpc,
        instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
        machineImage: new EksOptimizedImage({
          nodeType: NodeType.STANDARD,
        }),
        minCapacity: 1,
        maxCapacity: 2,
        desiredCapacity: 1,
        updateType: UpdateType.ROLLING_UPDATE,
        vpcSubnets: {
          subnets: vpc.privateSubnets
      },
    });

    cluster.addAutoScalingGroup(asg, {});
    
    return cluster;
  }
}
