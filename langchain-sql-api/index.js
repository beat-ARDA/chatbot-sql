// index.js con require
import "dotenv/config";
import express from "express";
import cors from "cors";
import snowflake from "snowflake-sdk";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";

const semanticModel = {
    tables: {
        V_PROD_SHIPMENTS: {
            alias: "envíos, shipments",
            columns: {
                ID: { synonyms: ["envío id", "id del envio"], type: "attribute" },
                COMPANY_ID: {
                    synonyms: ["id cliente"],
                    type: "attribute",
                },
                CREATED_AT: {
                    synonyms: [ "fecha de envío"],
                    type: "attribute",
                },
            },
        },
        V_PROD_COMPANIES: {
            alias: "clientes",
            columns: {
                ID: { synonyms: ["cliente id", "empresa id"], type: "attribute" },
                NAME: {
                    synonyms: ["nombre empresa", "nombre cliente"],
                    type: "attribute",
                },
            },
        },
        V_PROD_USERS: {
            alias: "usuarios",
            columns: {
                ID: { synonyms: ["usuario id"], type: "attribute" },
                EMAIL: { synonyms: ["correo usuario", "email usuario"], type: "attribute" },
                COMPANY_ID: { synonyms: ["cliente id", "empresa id"], type: "attribute" },
                CREATED_AT: {
                    synonyms: ["registro", "alta"],
                    type: "attribute",
                },
            },
        },
    },
    relationships: [
        {
            from: "V_PROD_SHIPMENTS.COMPANY_ID",
            to: "V_PROD_COMPANIES.ID",
            type: "many-to-one",
        },
        {
            from: "V_PROD_USERS.COMPANY_ID",
            to: "V_PROD_COMPANIES.ID",
            type: "many-to-one",
        },
    ],
};

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a Snowflake
const sfConnection = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
});

let schemaInfo = "Cargando esquema...";

async function connectToSnowflake() {
    return new Promise((resolve, reject) => {
        console.log("🧪 Intentando conectar a Snowflake...");

        sfConnection.connect((err) => {
            if (err) {
                console.error("❌ Error conectando a Snowflake:", err.message);
                reject(err);
            } else {
                console.log("✅ Conectado a Snowflake");

                const sql = `
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = '${process.env.SNOWFLAKE_SCHEMA}'
            ORDER BY table_name, ordinal_position
          `;

                sfConnection.execute({
                    sqlText: sql,
                    complete: (err, _stmt, rows) => {
                        if (err) {
                            console.error(
                                "❌ Error al obtener esquema:",
                                err.message
                            );
                            reject(err);
                        } else {
                            console.log(
                                "✅ Consulta ejecutada. Filas devueltas:",
                                rows.length
                            );
                            if (rows.length === 0) {
                                console.warn(
                                    "⚠️ No se encontraron columnas en el esquema especificado."
                                );
                            }

                            const tablasPermitidas = [
                                "V_PROD_SHIPMENTS",
                                "V_PROD_COMPANIES",
                                "V_PROD_USERS",
                                "V_PROD_LOCALES",
                            ];

                            const agrupado = {};
                            rows.forEach(({ TABLE_NAME, COLUMN_NAME }) => {
                                if (!tablasPermitidas.includes(TABLE_NAME))
                                    return;
                                if (!agrupado[TABLE_NAME])
                                    agrupado[TABLE_NAME] = [];
                                agrupado[TABLE_NAME].push(COLUMN_NAME);
                            });

                            schemaInfo = Object.entries(agrupado)
                                .map(
                                    ([table, columns]) =>
                                        `Tabla: ${table}(${columns.join(", ")})`
                                )
                                .join("\n");

                            console.log(
                                "📋 Esquema (filtrado) detectado:\n",
                                schemaInfo
                            );

                            resolve();
                        }
                    },
                });
            }
        });
    });
}

const model = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
});

const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `
  Convierte esta frase a SQL.
  
  Frase: {question}
  
  Base de datos Snowflake:
  {schema}
  
  Modelo semántico:
  {semantic}
  
  Ten en cuenta los sinónimos, relaciones y significado de cada tabla. Usa JOINs si es necesario. Responde SOLO con SQL válido.
  `
    ]
  ]);

// Secuencia (pipeline)
const chain = RunnableSequence.from([prompt, model]);

app.post("/sql", async (req, res) => {
    try {
        const { question } = req.body;

        const semanticText = Object.entries(semanticModel.tables)
            .map(([table, def]) => {
                const columns = Object.entries(def.columns)
                    .map(([col, meta]) => {
                        const syns = meta.synonyms.join(", ");
                        return `  - ${col} (sinónimos: ${syns})`;
                    })
                    .join("\n");
                return `Tabla: ${table} (${def.alias})\n${columns}`;
            })
            .join("\n\n");

            const sql = await chain.invoke({
                question,
                schema: schemaInfo,
                semantic: semanticText
              });
        // const sql =
        //     "SELECT * FROM shipments WHERE MONTH(created_at) = 1; // Ejemplo fijo";

        // Opcional: ejecuta la consulta en Snowflake
        // sfConnection.execute({
        //   sqlText: sql,
        //   complete: (err, _stmt, rows) => {
        //     if (err) {
        //       return res.status(500).json({ error: "Error al ejecutar SQL", detail: err.message });
        //     }
        //     res.json({ sql, result: rows });
        //   },
        // });

        // Solo devuelve el SQL (por ahora)
        const output =
            typeof sql === "string"
                ? sql
                : String(
                      sql?.content ||
                          sql?.kwargs?.content ||
                          sql?.text ||
                          JSON.stringify(sql)
                  );

        res.json({ sql: output });
    } catch (err) {
        console.error("❌ Error general:", err);
        res.status(500).json({ error: "Error al generar SQL" });
    }
});

connectToSnowflake()
    .then(() => {
        app.listen(3001, () => {
            console.log(
                "🧠 API de LangChain escuchando en http://localhost:3001"
            );
        });
    })
    .catch((err) => {
        console.error(
            "💥 No se pudo inicializar el servidor por error en conexión:",
            err.message
        );
    });
