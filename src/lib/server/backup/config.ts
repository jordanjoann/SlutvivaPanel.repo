export interface BackupStorageConfig {
  bucket: string;
  endpoint: string;
  region: string;
  keyId: string;
  applicationKey: string;
}

export interface BackupConfig {
  stagingDir: string;
  panelDbPath: string;
  gameStorage?: BackupStorageConfig;
  systemStorage?: BackupStorageConfig;
  systemAgeRecipient?: string;
}

type BackupEnv = Record<string, string | undefined>;

interface CompleteGameBackupEnv extends BackupEnv {
  B2_GAME_BACKUPS_BUCKET: string;
  B2_S3_ENDPOINT: string;
  B2_REGION: string;
  B2_GAME_BACKUPS_KEY_ID: string;
  B2_GAME_BACKUPS_APPLICATION_KEY: string;
}

interface CompleteSystemBackupEnv extends BackupEnv {
  B2_SYSTEM_BACKUPS_BUCKET: string;
  B2_S3_ENDPOINT: string;
  B2_REGION: string;
  B2_SYSTEM_BACKUPS_KEY_ID: string;
  B2_SYSTEM_BACKUPS_APPLICATION_KEY: string;
}

const DEFAULT_STAGING_DIR = "/opt/slutvival/backups/staging";
const DEFAULT_DB_PATH = "/opt/slutvival/data/slutvival-panel.sqlite";

export function readBackupConfig(
  env: CompleteGameBackupEnv & CompleteSystemBackupEnv,
): BackupConfig & { gameStorage: BackupStorageConfig; systemStorage: BackupStorageConfig };
export function readBackupConfig(env: CompleteGameBackupEnv): BackupConfig & { gameStorage: BackupStorageConfig };
export function readBackupConfig(env: CompleteSystemBackupEnv): BackupConfig & { systemStorage: BackupStorageConfig };
export function readBackupConfig(env?: BackupEnv): BackupConfig;
export function readBackupConfig(env: BackupEnv = process.env): BackupConfig {
  return {
    stagingDir: env.SLUTVIVAL_BACKUP_STAGING_DIR || DEFAULT_STAGING_DIR,
    panelDbPath: env.SLUTVIVAL_PANEL_DB || DEFAULT_DB_PATH,
    gameStorage: readStorage(env, "GAME"),
    systemStorage: readStorage(env, "SYSTEM"),
    systemAgeRecipient: env.SLUTVIVAL_SYSTEM_BACKUP_AGE_RECIPIENT,
  };
}

export function requireGameStorageConfig(config = readBackupConfig()): BackupStorageConfig {
  if (!config.gameStorage) {
    throw new Error("B2 game backup configuration is required.");
  }
  return config.gameStorage;
}

export function requireSystemStorageConfig(config = readBackupConfig()): BackupStorageConfig {
  if (!config.systemStorage) {
    throw new Error("B2 system backup configuration is required.");
  }
  return config.systemStorage;
}

function readStorage(env: BackupEnv, scope: "GAME" | "SYSTEM"): BackupStorageConfig | undefined {
  const bucket = env[`B2_${scope}_BACKUPS_BUCKET`];
  const endpoint = env.B2_S3_ENDPOINT;
  const region = env.B2_REGION;
  const keyId = env[`B2_${scope}_BACKUPS_KEY_ID`];
  const applicationKey = env[`B2_${scope}_BACKUPS_APPLICATION_KEY`];
  const scopedValues = [bucket, keyId, applicationKey];
  const values = [bucket, endpoint, region, keyId, applicationKey];
  if (scopedValues.every((value) => !value)) return undefined;
  if (values.some((value) => !value)) {
    throw new Error(`B2 ${scope.toLowerCase()} backup configuration is incomplete.`);
  }
  return {
    bucket: bucket!,
    endpoint: endpoint!,
    region: region!,
    keyId: keyId!,
    applicationKey: applicationKey!,
  };
}
