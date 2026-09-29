// AWS 클라이언트는 모듈 최상단에서 한 번만 만든다. Lambda 컨테이너가 살아 있는 동안
// 재사용되므로 연결·자격증명 조회 비용이 요청마다 반복되지 않는다.
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { config } from "./config.ts";

export const ddb = DynamoDBDocument.from(new DynamoDBClient({ region: config.region }), {
  // undefined 필드를 빼고 쓴다. 안 그러면 SDK 가 "값이 undefined" 라며 던진다.
  marshallOptions: { removeUndefinedValues: true },
});

export const s3 = new S3Client({ region: config.region });
export const ssm = new SSMClient({ region: config.region });
export const cognito = new CognitoIdentityProviderClient({ region: config.region });
