import { Prisma } from '@prisma/client';

export const clientRequestPackageInclude = {
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  items: {
    include: {
      requestItem: {
        select: {
          id: true,
          barcode: true,
          name: true,
          quantity: true,
          sku: {
            select: {
              id: true,
              internalSku: true,
              name: true,
            },
          },
        },
      },
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
} satisfies Prisma.ClientRequestPackageInclude;

