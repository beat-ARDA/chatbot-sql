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

    /**
     * Establece la conexión con SQL Server y construye dinámicamente el catálogo de metadatos.
     * * @description Esta función realiza tres operaciones críticas:
     * 1. Autenticación con el servidor mediante el pool de conexiones.
     * 2. Reflexión de la base de datos (Database Reflection) consultando INFORMATION_SCHEMA.
     * 3. Transformación de metadatos planos a una estructura jerárquica para optimizar el prompt del LLM.
     * * @async
     * @method connect
     * @throws {Error} Si la conexión falla o las credenciales son incorrectas.
     * @returns {Promise<void>} No retorna valor, pero inicializa la propiedad `this.schemaInfo`.
     */
    async connect() {
        try {
            const pool = await sql.connect(this.config);
            console.log("✅ Conexión exitosa a SQL Server");

            const result = await pool.query(`
                SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA IN ('Sales', 'Production', 'Person')
            `);

            //crea un objeto para agrupar las columnas por tabla
            const agrupado = {};
            result.recordset.forEach(({ TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME }) => {
                const fullTableName = `${TABLE_SCHEMA}.${TABLE_NAME}`;
                if (!agrupado[fullTableName]) agrupado[fullTableName] = [];
                agrupado[fullTableName].push(COLUMN_NAME);
            });

            //Genera el texto del schema de manera dinamica
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