import "dotenv/config";
import express from "express";
import cors from "cors";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { readFile } from "fs/promises";

import { SnowflakeDb } from "./config/dbSnowflake.js";
import { SqlServerDb } from "./config/dbSql.js";
import { snowflakeSystemPrompt } from "./prompts/snowflakePrompt.js";
import { sqlServerSystemPrompt } from "./prompts/sqlServerPrompt.js";

const app = express();
app.use(cors());
app.use(express.json());

const DB_TYPE = process.env.DB_TYPE || "SQLSERVER";

let db;
let systemInstructions;
let modelPath;

if (DB_TYPE === "SNOWFLAKE") {
    db = new SnowflakeDb();
    systemInstructions = snowflakeSystemPrompt;
    modelPath = "./models/shipments.json";
} else {
    db = new SqlServerDb();
    systemInstructions = sqlServerSystemPrompt;
    modelPath = "./models/adventureWorks.json";
}

const semanticModel = JSON.parse(await readFile(new URL(modelPath, import.meta.url)));

const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
});

const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemInstructions]
]);

function cleanSqlOutput(sqlText) {
    return sqlText
        .replace(/^```sql\s*/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim();
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

        const sqlResponse = await chain.invoke({
            question,
            schema: db.getSchemaInfo(),
            semantic: semanticText,
        });

        const sqlText = cleanSqlOutput(sqlResponse?.content || sqlResponse);

        console.log(`📝 SQL [${DB_TYPE}]:`, sqlText);

        const queryResult = await db.executeQuery(sqlText);

        res.json({ sql: sqlText, result: queryResult });
    } catch (err) {
        res.status(500).json({ error: "Error", detail: err.message });
    }
});

db.connect().then(() => {
    const PORT = process.env.PORT || 3001;
    app.listen(3001, () => {
        console.log(`🚀 Engine [${DB_TYPE}] corriendo en http://localhost:3001`);
    });
});
