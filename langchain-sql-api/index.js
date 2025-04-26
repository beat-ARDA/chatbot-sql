// index.js con require
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { SnowflakeDb } from "./config/dbSnowflake.js";
import { readFile } from "fs/promises";

const file = await readFile(
    new URL("./models/shipments.json", import.meta.url)
);
const data = JSON.parse(file);

const app = express();
app.use(cors());
app.use(express.json());

const dbSnowflake = new SnowflakeDb();

const model = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
});

// ✅ Nuevo Prompt optimizado para Snowflake y tu modelo
const prompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        `
Eres un generador experto de SQL para Snowflake.

Convierte la siguiente pregunta de lenguaje natural en una consulta SQL Snowflake precisa.

Consideraciones importantes:
- Usa "V_PROD_SHIPMENTS" para métricas de envíos.
- Usa "V_PROD_COMPANIES" para información de clientes.
- Usa "V_PROD_USERS" solamente si la consulta explícitamente habla de usuarios.
- Usa medidas predefinidas si están disponibles.
- Apoya tus decisiones en alias, sinónimos, tipos de tabla y relaciones del modelo semántico.
- Utiliza funciones como DATE_TRUNC, TO_DATE o EXTRACT si hay fechas.
- Prioriza COUNT(DISTINCT ...) para conteo de clientes únicos.
- Solo responde con SQL válido, sin explicaciones ni comentarios.

Frase del usuario:
{question}

Esquema Snowflake:
{schema}

Modelo semántico enriquecido:
{semantic}
`,
    ],
]);

const chain = RunnableSequence.from([prompt, model]);

app.post("/sql", async (req, res) => {
    try {
        const { question } = req.body;

        const semanticText = Object.entries(data.tables)
            .map(([table, def]) => {
                const columns = Object.entries(def.columns)
                    .map(([col, meta]) => {
                        const synonyms = meta.synonyms.join(", ");
                        return `  - ${col} (sinónimos: ${synonyms})`;
                    })
                    .join("\n");

                const measures = def.measures
                    ? Object.entries(def.measures)
                          .map(([measureName, measureMeta]) => {
                              const synonyms = measureMeta.synonyms.join(", ");
                              return `  - Medida: ${measureName} (${measureMeta.expression}) (sinónimos: ${synonyms})`;
                          })
                          .join("\n")
                    : "";

                return `Tabla: ${table} (${def.alias}) — ${
                    def.description || ""
                } [${def.role}]
${columns}
${measures}`;
            })
            .join("\n\n");

        const sql = await chain.invoke({
            question,
            schema: dbSnowflake.getSchemaInfo(),
            semantic: semanticText,
        });

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

dbSnowflake
    .connect()
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
