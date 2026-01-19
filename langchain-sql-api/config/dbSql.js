import sql from "mssql";

export class SqlServerDb {
    constructor() {
        this.config = {
            user: process.env.SQLCLOUD_USER,
            password: process.env.SQLCLOUD_PASSWORD,
            server: process.env.SQLCLOUD_SERVER,
            database: process.env.SQLCLOUD_DATABASE,
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        };

        this.schemaInfo = "Cargando esquema...";
    }

    async connect() {
        try {
            await sql.connect(this.config);

            const result = await sql.query(`
                SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA IN ('Sales', 'Production', 'Person')

            `);

            const agrupado = {};
            result.recordset.forEach(({ TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME }) => {
                const fullTableName = `${TABLE_SCHEMA}.${TABLE_NAME}`;
                if (!agrupado[fullTableName]) agrupado[fullTableName] = [];
                agrupado[fullTableName].push(COLUMN_NAME);
            });

            this.schemaInfo = Object.entries(agrupado)
                .map(([table, columns]) => `Tabla: ${table}(${columns.join(", ")})`)
                .join("\n");

        } catch (err) {
            throw err;
        }
    }

    getSchemaInfo() {
        return this.schemaInfo;
    }

    async executeQuery(sqlText) {
        const result = await sql.query(sqlText);
        return result.recordset;
    }
}
