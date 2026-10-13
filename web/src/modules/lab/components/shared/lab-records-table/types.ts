/**
 * What the viewer's role allows on this table, decided by the page from
 * permissions.ts rather than inferred here from a role name.
 */
export interface LabRecordsAccess {
  /** Edit a record, and tick rows to remove or restore them. */
  canEdit: boolean;
  canExport: boolean;
  /** The Active / Deleted switch. Read-only unless canEdit is also held. */
  canViewDeleted: boolean;
}

export type Confirming = false | "samples" | "subs";
