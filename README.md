# @spreen/dynamo-objects

## Type Safe DynamoDB Objects in TypeScript

Example usage:

```ts
import { DynamoObject, getMeta } from "./dynamoObject";

export class User extends DynamoObject<User> {
  _meta = {
    tableName: `questions-users${STAGING ? "-stg" : ""}`,
    partitionKey: "id",
  } as const;

  id = "";
  firstName = "";
  apnsToken?: string;
  sentInvitation?: { id: string; code: string } | null;
  relationship?: string;
  lastLogInTs = "";
  accountCreatedTs = "";

  static create(props: Omit<User, "_meta">): User {
    return { _meta: getMeta(User), ...props };
  }
}
```
