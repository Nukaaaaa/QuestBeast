import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';

import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';

import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';

import mongoose from 'mongoose';
import { pubsub } from './pubsub';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { verifyToken } from './utils/auth';

const PORT = Number(process.env.PORT) || 4000;

/**
 * Унифицированный builder контекста
 * Работает и для HTTP, и для WS
 */
const buildContext = (authHeader?: string) => {
  if (!authHeader) {
    return { userId: null, pubsub };
  }

  try {
    const decoded = verifyToken(authHeader);
    return { userId: decoded.userId, pubsub };
  } catch {
    return { userId: null, pubsub };
  }
};

async function bootstrap() {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅ MongoDB подключён');

  const app = express();
  const httpServer = http.createServer(app);

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  /**
   * WebSocket (Subscriptions)
   */
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        const authHeader =
          (ctx.connectionParams?.authorization as string | undefined) ??
          (ctx.connectionParams?.Authorization as string | undefined);

        return buildContext(authHeader);
      },
    },
    wsServer,
  );

  /**
   * Apollo Server
   */
  const apolloServer = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apolloServer.start();

  /**
   * HTTP (Queries + Mutations)
   */
  app.use(
    '/graphql',
    cors(),
    express.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        const authHeader = req.headers.authorization;
        return buildContext(authHeader);
      },
    }),
  );

  await new Promise<void>((resolve) => {
    httpServer.listen({ port: PORT }, resolve);
  });

  console.log(`🚀 HTTP ready at http://localhost:${PORT}/graphql`);
  console.log(`🔌 WS ready at ws://localhost:${PORT}/graphql`);
}

bootstrap().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
