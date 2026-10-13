import "server-only";

import { prisma } from "@/core/lib/prisma";
import { idCursorArgs, num, pagedById, when, type BackupSection } from "@/core/lib/sheets/backup-kit";

/** The Eksplorasi module's part of the backup: every drill hole. */
export const backupSection: BackupSection = {
  counts: async () => {
    return { drillHoles: await prisma.drillHole.count() };
  },
  sheets: () => {
    return [
      {
        name: "Drill Holes",
        columns: [
          { header: "Hole ID", key: "holeId", width: 14 },
          { header: "Area", key: "area", width: 16 },
          { header: "Status", key: "status", width: 11 },
          { header: "Easting", key: "easting", width: 13 },
          { header: "Northing", key: "northing", width: 13 },
          { header: "Elevation", key: "elevation", width: 10 },
          { header: "Azimuth", key: "azimuth", width: 9 },
          { header: "Dip", key: "dip", width: 8 },
          { header: "Total Depth", key: "totalDepth", width: 11 },
          { header: "Start Date", key: "startDate", width: 12 },
          { header: "End Date", key: "endDate", width: 12 },
          { header: "Remarks", key: "remarks", width: 30 },
          { header: "Created By", key: "createdBy", width: 18 },
          { header: "Created At", key: "createdAt", width: 20 },
        ],
        rows: async function* () {
          const holes = pagedById((cursor) =>
            prisma.drillHole.findMany({
              ...idCursorArgs(cursor),
              include: { createdBy: { select: { name: true } } },
            })
          );
          for await (const hole of holes) {
            yield {
              holeId: hole.holeId,
              area: hole.area,
              status: hole.status,
              easting: num(hole.easting),
              northing: num(hole.northing),
              elevation: num(hole.elevation),
              azimuth: num(hole.azimuth),
              dip: num(hole.dip),
              totalDepth: num(hole.totalDepth),
              startDate: hole.startDate?.toISOString().slice(0, 10) ?? null,
              endDate: hole.endDate?.toISOString().slice(0, 10) ?? null,
              remarks: hole.remarks,
              createdBy: hole.createdBy.name,
              createdAt: when(hole.createdAt),
            };
          }
        },
      },
    ];
  },
  about: [["Drill holes", "drillHoles"]],
};
