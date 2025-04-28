// index.js con mejoras tipo ThoughtSpot
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
const semanticModel = JSON.parse(file);

const app = express();
app.use(cors());
app.use(express.json());

const dbSnowflake = new SnowflakeDb();

const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
});

const prompt = ChatPromptTemplate.fromMessages([[
    "system",
    `
    Eres un generador experto de SQL Snowflake.

     Tarea:
    - Convierte la pregunta en SQL usando las siguientes guías:
    - Tabla principal: V_PROD_SHIPMENTS si es sobre envíos.
    - Usa COUNT(DISTINCT ...) para conteos únicos.
    - Usa DATEADD, DATE_TRUNC, EXTRACT para cálculos de fecha.
    - Usa medidas predefinidas si existen.
    - Si necesitas detalles de clientes, realiza JOIN explícito a V_PROD_COMPANIES.

    Modelo semántico disponible:
    {semantic}

    Esquema de base de datos:
    {schema}

    Ejemplos:
    - Pregunta: ¿Cuántos envíos se realizaron este mes?
    SQL: 
    SELECT COUNT(ID) AS total_envios
    FROM V_PROD_SHIPMENTS
    WHERE DATE_TRUNC('month', CREATED_AT) = DATE_TRUNC('month', CURRENT_DATE());

    - Pregunta: ¿Cantidad de clientes únicos que enviaron en los últimos 3 meses?
    SQL: 
    SELECT COUNT(DISTINCT COMPANY_ID) AS clientes_unicos
    FROM V_PROD_SHIPMENTS
    WHERE CREATED_AT >= DATEADD(month, -3, CURRENT_DATE());

    - Pregunta: ¿Total de guías por mes en el último año?
    SQL:
    SELECT DATE_TRUNC('month', CREATED_AT) AS mes, COUNT(ID) AS total_envios
    FROM V_PROD_SHIPMENTS
    WHERE CREATED_AT >= DATEADD(month, -12, CURRENT_DATE())
    GROUP BY mes
    ORDER BY mes;

    Importante:
    - Solo responde con SQL válido.
    - No expliques nada, solo responde con el query.

    Pregunta del usuario:
    {question}
`]]);

function cleanSqlOutput(sqlText) {
    return sqlText
        .replace(/^```sql\s*/i, '')  // elimina ```sql al inicio
        .replace(/^```/i, '')         // elimina ``` si aparece solo
        .replace(/```$/i, '')         // elimina ``` al final
        .trim();                      // elimina espacios
}

const chain = RunnableSequence.from([prompt, model]);

function buildSemanticText(semanticModel) {
    const tablesText = Object.entries(semanticModel.tables).map(([table, def]) => {
        const columns = Object.entries(def.columns).map(([col, meta]) => {
            const synonyms = meta.synonyms.length ? ` Sinónimos: ${meta.synonyms.join(", ")}` : ""; return `    - ${col}:${synonyms}`;
        }).join("\n");

        const measures = def.measures ? Object.entries(def.measures).map(([measureName, measureMeta]) => {
            const synonyms = measureMeta.synonyms.length ? ` Sinónimos: ${measureMeta.synonyms.join(", ")}` : "";
            return `- Medida ${measureName}: ${measureMeta.expression}.${synonyms}`;
        }).join("\n") : "";

        return `Tabla: ${table} (${def.alias}) — ${def.description} Tipo: ${def.role} Columnas: ${columns} Medidas: ${measures}`;
    }).join("\n");

    const relationshipsText = semanticModel.relationships.map(rel => `Relación entre ${rel.from} ➔ ${rel.to} (${rel.type})`).join("\n");

    return `${tablesText}\nRelaciones:\n${relationshipsText}`;
}

app.post("/sql", async (req, res) => {
    try {
        let { question } = req.body;

        const semanticText = buildSemanticText(semanticModel);

        const sql = await chain.invoke({
            question,
            schema: dbSnowflake.getSchemaInfo(),
            semantic: semanticText,
        });

        const output =
            typeof sql === "string"
                ? sql
                : sql?.content || sql?.kwargs?.content || sql?.text || JSON.stringify(sql);

        const cleanedSql = typeof output === "string" ? output : JSON.stringify(output);

        const sqlText = cleanSqlOutput(cleanedSql);

        console.log("📝 SQL a ejecutar:", sqlText);

        const queryResult = await dbSnowflake.executeQuery(sqlText);

        res.json({
            sql: sqlText,
            result: queryResult
        });
    } catch (err) {
        console.error("❌ Error general:", err);
        res.status(500).json({ error: "Error al generar SQL", detail: err.message });
    }
});

dbSnowflake
    .connect()
    .then(() => {
        app.listen(3001, () => {
            console.log("🧠 API de LangChain mejorada escuchando en http://localhost:3001");
        });
    })
    .catch((err) => {
        console.error("💥 No se pudo inicializar el servidor por error en conexión:", err.message);
    });
