import sql from "mssql";

export class SqlServerDb {
    constructor() {
        this.config = {
            user: process.env.SQLCLOUD_USER,
            password: process.env.SQLCLOUD_PASSWORD,
            server: process.env.SQLCLOUD_SERVER,
            database: process.env.SQLCLOUD_DATABASE,
            port: 1433,
            options: {
                encrypt: true,
                trustServerCertificate: false,
                connectTimeout: 30000
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        };

        this.schemaInfo = "Cargando esquema...";
    }

    async connect() {
        try {
            const pool = await sql.connect(this.config);
            console.log("✅ Conexión exitosa a SQL Server");

            const result = await pool.query(`
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
            console.error("❌ Error de conexión SQL:", err.message);
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