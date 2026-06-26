import { Prisma } from '@prisma/client';

export const pickWaveInclude = {
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  requests: {
    include: {
      request: {
        select: {
          id: true,
          clientId: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          client: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          items: {
            include: {
              sku: {
                select: {
                  id: true,
                  internalSku: true,
                  name: true,
                },
              },
            },
            orderBy: {
              id: 'asc',
            },
          },
        },
      },
    },
    orderBy: {
      requestId: 'asc',
    },
  },
} satisfies Prisma.PickWaveInclude;

