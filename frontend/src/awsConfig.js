import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// ─── Configuration ───
// For production: use Amazon Cognito to provide temporary credentials.
// For local dev/demo: the app works without credentials (demo mode).
const AWS_REGION = 'us-east-1';
const TABLE_NAME = 'ScrapeTasks';
const S3_BUCKET  = 'scraped-images-storage';

let client = null;

try {
  client = new DynamoDBClient({ region: AWS_REGION });
} catch (e) {
  console.warn('AWS SDK client could not be initialised — running in demo mode.', e);
}

export { client, TABLE_NAME, S3_BUCKET, AWS_REGION };
