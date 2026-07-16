export declare const idCountersTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "id_counters";
    schema: undefined;
    columns: {
        key: import("drizzle-orm/pg-core").PgColumn<{
            name: "key";
            tableName: "id_counters";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        value: import("drizzle-orm/pg-core").PgColumn<{
            name: "value";
            tableName: "id_counters";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export type IdCounter = typeof idCountersTable.$inferSelect;
//# sourceMappingURL=id-counters.d.ts.map