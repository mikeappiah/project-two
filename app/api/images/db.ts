import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import postgres from 'postgres';

const ssmClient = new SSMClient({
	region: process.env.AWS_REGION
});

async function getDatabaseCredentials() {
	const [username, password, endpoint] = await Promise.all([
		ssmClient.send(
			new GetParameterCommand({ Name: '/project-two/db/username' })
		),
		ssmClient.send(
			new GetParameterCommand({
				Name: '/project-two/db/password',
				WithDecryption: true
			})
		),
		ssmClient.send(
			new GetParameterCommand({ Name: '/project-two/db/endpoint' })
		)
	]);

	return {
		host: endpoint.Parameter!.Value,
		database: process.env.AWS_DATABASE_NAME,
		username: username.Parameter!.Value,
		password: password.Parameter!.Value,
		port: 5432,
		ssl: { rejectUnauthorized: false }
	};
}

async function initializeDatabase() {
	const dbCredentials = await getDatabaseCredentials();

	const sql = postgres(dbCredentials);

	try {
		await sql`
            CREATE TABLE IF NOT EXISTS images (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                url VARCHAR(255) NOT NULL,
                description TEXT,
                size INTEGER,
                last_modified TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `;
		console.log('Database initialized successfully');
		return sql;
	} catch (error) {
		console.error('Database initialization failed:', error);
		throw error;
	}
}

let sqlInstance: ReturnType<typeof postgres> | null = null;

async function getDatabase() {
	if (!sqlInstance) {
		sqlInstance = await initializeDatabase();
	}
	return sqlInstance;
}

export { getDatabase };
