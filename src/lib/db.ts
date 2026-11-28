import { PrismaClient } from "@prisma/client";

// Un seul client par instance serveur. SQL_TRACE=1 (mesures de performance) : chaque requête SQL est comptée dans les logs.
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient(process.env.SQL_TRACE ? { log: [{ emit: "stdout", level: "query" }] } : undefined);
g.prisma = db;
