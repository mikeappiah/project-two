import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
	PutObjectCommand,
	S3Client,
	DeleteObjectCommand
} from '@aws-sdk/client-s3';

import { Readable } from 'stream';
import { getDatabase } from './db';

const s3Client = new S3Client({
	region: process.env.AWS_REGION!
});

const bucketName = process.env.AWS_S3_BUCKET_NAME as string;
const region = process.env.AWS_REGION as string;

const bufferToStream = (buffer: Buffer) => {
	const stream = new Readable();
	stream.push(buffer);
	stream.push(null);
	return stream;
};

export async function POST(req: NextRequest) {
	const formData = await req.formData();
	const file = formData.get('image') as File | null;
	const description = formData.get('description') as string | null;

	if (!file) {
		return NextResponse.json({ error: 'No file provided' }, { status: 400 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const fileName = `${uuidv4()}.${file.name.split('.').pop()}`;
	const imageUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${fileName}`;

	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: fileName,
		Body: bufferToStream(buffer),
		ContentType: file.type,
		ContentLength: buffer.length
	});

	try {
		await s3Client.send(command);

		const db = await getDatabase();

		const id = uuidv4();
		await db`
            INSERT INTO images (id, name, url, description, size)
            VALUES (${id}, ${fileName}, ${imageUrl}, ${description || ''}, ${
			buffer.length
		})
        `;

		return NextResponse.json({
			status: 'success',
			id,
			name: fileName,
			url: imageUrl,
			description: description || ''
		});
	} catch (error) {
		console.error('POST /api/images error:', error);
		return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
	}
}

export async function GET() {
	try {
		const db = await getDatabase();
		const rows = await db`
            SELECT * FROM images 
            ORDER BY last_modified DESC
        `;

		return NextResponse.json({
			status: 'success',
			data: rows.map((row) => ({
				id: row.id,
				name: row.name,
				url: row.url,
				description: row.description,
				size: row.size,
				lastModified: row.last_modified
			})),
			results: rows.length
		});
	} catch (error) {
		console.error('GET /api/images error:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch images' },
			{ status: 500 }
		);
	}
}

export async function DELETE(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');

		if (!id) {
			return NextResponse.json(
				{ error: 'Image ID is required' },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const rows = await db`
            SELECT name FROM images 
            WHERE id = ${id}
        `;

		if (rows.length === 0) {
			return NextResponse.json({ error: 'Image not found' }, { status: 404 });
		}

		const key = rows[0].name;
		const command = new DeleteObjectCommand({ Bucket: bucketName, Key: key });
		await s3Client.send(command);
		await db`
            DELETE FROM images 
            WHERE id = ${id}
        `;

		return NextResponse.json({
			status: 'success',
			message: `Image ${key} deleted`
		});
	} catch (error) {
		console.error('DELETE /api/images error:', error);
		return NextResponse.json(
			{ error: 'Failed to delete image' },
			{ status: 500 }
		);
	}
}
