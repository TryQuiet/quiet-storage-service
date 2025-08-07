export enum AWSSecretNames {
  // randomly generated secret names for various environments
  RDS_CREDS_DEV = 'rds!cluster-e4c19da7-ba44-45ce-8357-dc5e54a7c336',
  RDS_CREDS_PROD = 'rds!cluster-f0cdc8d4-7392-4ac7-a5e0-1baafcad9987',
  SERVER_ENC_KEY_DEV = 'qss!dev-e-48da074e-4543-4fb8-9991-2c68227ba3de',
  SERVER_ENC_KEY_PROD = 'qss!prod-e-8356e98e-8eae-4f3d-9b92-05d72dd98338',
  SERVER_ENC_KEY_LOCAL = 'qss!local-e-697f6745-2e59-4016-be07-7a72ab021ae7',
}
