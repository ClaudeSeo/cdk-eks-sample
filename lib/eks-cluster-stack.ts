import { InstanceType, InstanceClass, InstanceSize, Vpc, VpcProps, SubnetType } from '@aws-cdk/aws-ec2'
import { CfnNodegroup, Cluster } from '@aws-cdk/aws-eks';
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal, AccountRootPrincipal } from '@aws-cdk/aws-iam';
import { App, CfnOutput, Stack, StackProps } from '@aws-cdk/core';

export interface Props extends StackProps {
  clusterName: string;
}

interface ClusterProps {
  clusterAdminRole: Role;
  clusterName: string;
  clusterRole: Role;
  nodeGroupRole: Role;
  vpc: Vpc;
}

export class EksClusterStack extends Stack {
  constructor(scope: App, id: string, props: Props) {
    super(scope, id, props);
    const { clusterName } = props;
    const vpc = this.createVpc();
    const clusterRole = this.createClusterRole();
    const clusterAdminRole = this.createClusterAdminRole();
    const nodeGroupRole = this.createNodeGroupRole();
    const cluster = this.createCluster({
      clusterAdminRole,
      clusterName,
      clusterRole,
      nodeGroupRole,
      vpc,
    });

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

  private createNodeGroupRole(): Role {
    const role = new Role(this, 'eks-node-group-role', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    role.addToPolicy(
      new PolicyStatement({
        actions: [
          'sts:AssumeRole',
        ],
        resources: ['*'],
      }),
    );

    return role;
  }

  private createCluster(props: ClusterProps): Cluster {
    const { clusterAdminRole, clusterRole, clusterName, nodeGroupRole, vpc } = props;
    const cluster = new Cluster(this, clusterName, {
      vpc,
      clusterName,
      role: clusterRole,
      mastersRole: clusterAdminRole,
      defaultCapacity: 0,
    });

    new CfnNodegroup(this, `${clusterName}-node-group`, {
      clusterName: cluster.clusterName,
      nodeRole: nodeGroupRole.roleArn,
      subnets: vpc.privateSubnets.map(it => it.subnetId),
      scalingConfig: {
        desiredSize: 1,
        maxSize: 2,
        minSize: 1,
      },
      instanceTypes: [
        InstanceType.of(InstanceClass.T3, InstanceSize.LARGE).toString(),
      ],
    });
    
    return cluster;
  }
}
