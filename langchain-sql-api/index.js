// index.js con require
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { SnowflakeDb } from './config/dbSnowflake.js';
import { readFile } from 'fs/promises';
const file = await readFile(new URL('./models/shipments.json', import.meta.url));
const data = JSON.parse(file);

const json = {
    tables: {
        V_PROD_SHIPMENTS: {
            alias: "envíos, shipments, guias",
            role: "fact",
            description: "Registros de envíos. Usar como tabla principal para métricas de envíos.",
            columns: {
                ID: { "synonyms": ["envío id", "id del envio"], "type": "attribute" },
                COMPANY_ID: { "synonyms": ["id cliente"], "type": "attribute" },
                CREATED_AT: { "synonyms": ["fecha de envío"], "type": "attribute" }
            }
        },
        V_PROD_COMPANIES: {
            alias: "clientes",
            role: "dimension",
            description: "Datos de clientes. Solo unir si se necesitan datos del cliente.",
            columns: {
                ID: { "synonyms": ["cliente id", "empresa id"], "type": "attribute" },
                NAME: { "synonyms": ["nombre empresa", "nombre cliente"], "type": "attribute" }
            }
        },
        V_PROD_USERS: {
            alias: "usuarios",
            role: "support",
            description: "Usuarios del sistema, no representan clientes ni envíos",
            columns: {
                ID: { "synonyms": ["usuario id"], "type": "attribute" },
                EMAIL: { "synonyms": ["correo usuario", "email usuario"], "type": "attribute" },
                COMPANY_ID: { "synonyms": ["cliente id", "empresa id"], "type": "attribute" },
                CREATED_AT: { "synonyms": ["registro", "alta"], "type": "attribute" }
            }
        }
    },
    relationships: [
        {
            from: "V_PROD_SHIPMENTS.COMPANY_ID",
            to: "V_PROD_COMPANIES.ID",
            type: "many-to-one"
        },
        {
            from: "V_PROD_USERS.COMPANY_ID",
            to: "V_PROD_COMPANIES.ID",
            type: "many-to-one"
        }
    ]
}

const app = express();
app.use(cors());
app.use(express.json());
const dbSnowflake = new SnowflakeDb();

const model = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
});

const prompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        `
      Eres un generador experto de SQL en dialecto de Snowflake. Tu tarea es transformar preguntas en lenguaje natural en consultas SQL completas, precisas y optimizadas. 
  
      Consideraciones importantes:
      - Usa subconsultas o CTEs ('WITH') cuando sea necesario.
      - Si el resultado requiere agrupación o conteo, usa 'GROUP BY', 'COUNT', etc.
      - Utiliza 'JOIN' entre tablas cuando las relaciones lo permitan, respetando claves y cardinalidades.
      - Apóyate en los sinónimos proporcionados para entender a qué columnas/tables se refiere el usuario.
      - Usa alias claros para tablas y columnas cuando la consulta sea compleja.
      - No inventes columnas o tablas no presentes en el esquema ni ignores restricciones semánticas.
      - Sé detallado y evita ambigüedades. Comenta la consulta si es compleja.
      - SOLO responde con el código SQL válido y nada más.
  
      Frase del usuario: {question}
  
      Esquema Snowflake:
      {schema}
  
      Modelo semántico enriquecido:
      {semantic}
      `
    ]
]);

const chain = RunnableSequence.from([prompt, model]);

app.post("/sql", async (req, res) => {
    try {
        const { question } = req.body;

        const semanticText = Object.entries(json.tables)
            .map(([table, def]) => {
                const columns = Object.entries(def.columns)
                    .map(([col, meta]) => {
                        const syns = meta.synonyms.join(", ");
                        return `  - ${col} (sinónimos: ${syns})`;
                    })
                    .join("\n");
                return `Tabla: ${table} (${def.alias}) — ${def.description || ""} [${def.role}]${columns}`;
            })
            .join("\n\n");

        const sql = await chain.invoke({
            question,
            schema: dbSnowflake.getSchemaInfo(),
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

dbSnowflake.connect().then(() => {
    app.listen(3001, () => {
        console.log(
            "🧠 API de LangChain escuchando en http://localhost:3001"
        );
    });
}).catch((err) => {
    console.error(
        "💥 No se pudo inicializar el servidor por error en conexión:",
        err.message
    );
});
