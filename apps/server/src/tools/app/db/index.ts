import { DBRegistry }     from "./registry.js"
import { SQLAdapter }     from "./adapters/sql.adapter.js"
import { MongoDBAdapter } from "./adapters/mongo.adapter.js"
import { RedisAdapter }   from "./adapters/redis.adapter.js"

DBRegistry
  .register("postgres",  SQLAdapter)
  .register("mysql",     SQLAdapter)
  .register("sqlite",    SQLAdapter)
  .register("mssql",     SQLAdapter)
  .register("mongodb",   MongoDBAdapter)
  .register("redis",     RedisAdapter)

export { DBRegistry }
