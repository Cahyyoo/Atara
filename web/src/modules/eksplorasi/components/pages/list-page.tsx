import { getTranslations } from "next-intl/server";
import { DataSourceTable } from "@/modules/eksplorasi/components/data-source-table";
import type { DataSourceView } from "@/modules/eksplorasi/types";

/**
 * One of the four list pages, laid out once: its title, and its table. Each
 * page under src/app guards itself and then renders this.
 */
export async function ListPage({ view }: { view: DataSourceView }) {
  const t = await getTranslations("dataSource.views");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(`${view}.title`)}</h1>
        <p className="text-sm text-muted-foreground">{t(`${view}.subtitle`)}</p>
      </div>
      <DataSourceTable view={view} />
    </div>
  );
}
