import type { Skill } from "./schema";

// Best-guess category for skills typed in by hand. Anything unknown lands in
// "other" and the user can recategorise it.
const KNOWN: Record<string, Skill["category"]> = {};
// Display names in dictionary order, used to spot skills a job asks for that the profile lacks.
export const KNOWN_SKILLS: { name: string; category: Skill["category"] }[] = [];

const add = (category: Skill["category"], names: string) => {
  for (const n of names.split(",")) {
    KNOWN[norm(n)] = category;
    KNOWN_SKILLS.push({ name: n, category });
  }
};

export const norm = (name: string) => name.toLowerCase().replace(/[^a-z0-9+#]/g, "");

add(
  "language",
  "JavaScript,TypeScript,Python,Java,C,C++,C#,Go,Golang,Rust,Kotlin,Swift,Ruby,PHP,Scala,R,SQL,Bash,Shell,PowerShell,Dart,Elixir,Haskell,Lua,MATLAB,Perl,Solidity,HTML,CSS",
);
add(
  "framework",
  "React,Next.js,Vue,Nuxt,Angular,Svelte,SvelteKit,Node.js,Express,NestJS,Fastify,Django,Flask,FastAPI,Spring,Spring Boot,Rails,Ruby on Rails,Laravel,.NET,ASP.NET,Tailwind,Tailwind CSS,React Native,Flutter,Electron,Tauri,PyTorch,TensorFlow,Keras,scikit-learn,Pandas,NumPy,LangChain,LlamaIndex,GraphQL,tRPC,Redux,jQuery,Bootstrap,Three.js,GSAP",
);
add(
  "database",
  "PostgreSQL,Postgres,MySQL,SQLite,MongoDB,Redis,DynamoDB,Cassandra,Elasticsearch,OpenSearch,Supabase,Firebase,Firestore,Snowflake,BigQuery,ClickHouse,Neo4j,Pinecone,pgvector,Qdrant,Weaviate,Oracle,SQL Server,MariaDB,Prisma,Drizzle",
);
add(
  "cloud",
  "AWS,Azure,GCP,Google Cloud,Vercel,Netlify,Cloudflare,Heroku,DigitalOcean,Lambda,EC2,S3,ECS,EKS,Cloud Run,Kubernetes,Docker,Terraform,Pulumi,Ansible,Serverless",
);
add(
  "tool",
  "Git,GitHub,GitLab,GitHub Actions,Jenkins,CircleCI,Jira,Figma,Postman,Webpack,Vite,Turbopack,Jest,Vitest,Playwright,Cypress,Selenium,Linux,Nginx,Kafka,RabbitMQ,Grafana,Prometheus,Datadog,Sentry,Airflow,dbt,Spark,Hadoop,Tableau,Power BI,Excel,VS Code",
);
add(
  "concept",
  "REST,REST APIs,Microservices,System Design,Data Structures,Algorithms,OOP,Distributed Systems,CI/CD,DevOps,Machine Learning,Deep Learning,NLP,Computer Vision,LLMs,RAG,Prompt Engineering,MCP,Agile,Scrum,TDD,Unit Testing,Web Security,OAuth,WebSockets,Event-Driven Architecture,ETL,Data Engineering,Data Analysis,Statistics",
);
add(
  "soft",
  "Communication,Leadership,Teamwork,Mentoring,Problem Solving,Stakeholder Management,Project Management,Public Speaking,Technical Writing",
);

export const guessCategory = (name: string): Skill["category"] => KNOWN[norm(name)] ?? "other";

export const CATEGORY_LABELS: Record<Skill["category"], string> = {
  language: "Languages",
  framework: "Frameworks & libraries",
  database: "Databases",
  cloud: "Cloud & infra",
  tool: "Tools",
  concept: "Concepts & practices",
  soft: "Soft skills",
  other: "Other",
};

export const LEVEL_LABELS: Record<Skill["level"], string> = {
  learning: "Learning",
  working: "Working",
  strong: "Strong",
  expert: "Expert",
};
