import snowflake from "snowflake-sdk";

export class SnowflakeDb {
    constructor() {
        this.connection = snowflake.createConnection({
            account: process.env.SNOWFLAKE_ACCOUNT,
            username: process.env.SNOWFLAKE_USERNAME,
            password: process.env.SNOWFLAKE_PASSWORD,
            warehouse: process.env.SNOWFLAKE_WAREHOUSE,
            database: process.env.SNOWFLAKE_DATABASE,
            schema: process.env.SNOWFLAKE_SCHEMA,
        });

        this.schemaInfo = "Cargando esquema...";
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.connection.connect((err) => {
                if (err) {
                    console.error("❌ Error conectando a Snowflake:", err.message);
                    return reject(err);
                }

                console.log("✅ Conectado a Snowflake");

                const sql = `
                    SELECT table_name, column_name
                    FROM information_schema.columns
                    WHERE table_schema = '${process.env.SNOWFLAKE_SCHEMA}'
                    ORDER BY table_name, ordinal_position
                `;

                this.connection.execute({
                    sqlText: sql,
                    complete: (err, _stmt, rows) => {
                        if (err) {
                            console.error("❌ Error al obtener esquema:", err.message);
                            return reject(err);
                        }

                        const tablasPermitidas = [
                            "V_PROD_SHIPMENTS",
                            "V_PROD_COMPANIES",
                            "V_PROD_USERS",
                        ];

                        const agrupado = {};

                        rows.forEach(({ TABLE_NAME, COLUMN_NAME }) => {
                            if (!tablasPermitidas.includes(TABLE_NAME)) return;
                            if (!agrupado[TABLE_NAME]) agrupado[TABLE_NAME] = [];
                            agrupado[TABLE_NAME].push(COLUMN_NAME);
                        });

                        this.schemaInfo = Object.entries(agrupado)
                            .map(([table, columns]) => `Tabla: ${table}(${columns.join(", ")})`)
                            .join("\n");

                        resolve();
                    },
                });
            });
        });
    }

    getSchemaInfo() {
        return this.schemaInfo;
    }

    getConnection() {
        return this.connection;
    }
}
