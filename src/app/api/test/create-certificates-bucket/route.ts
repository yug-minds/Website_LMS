/**
 * Helper endpoint to create certificates bucket
 * This runs the SQL migration to create the bucket
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
    // Check if bucket already exists
    const { data: buckets } = await supabaseAdmin.storage.listBuckets()
    const existingBucket = buckets?.find((b: any) => b.id === 'certificates')

    if (existingBucket) {
      return NextResponse.json({
        success: true,
        message: 'Certificates bucket already exists',
        bucket: existingBucket,
      })
    }

    // Create bucket via SQL (using RPC or direct SQL)
    // Note: Supabase JS client doesn't have direct bucket creation
    // We need to use the SQL editor or Management API
    
    // Try to create via SQL query
    const createBucketSQL = `
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'certificates',
        'certificates',
        true,
        5242880,
        ARRAY['image/png']
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
    `

    // Execute SQL via Supabase (if we have access to raw SQL)
    // Note: This might not work depending on RLS and permissions
    // The user should run the migration file instead
    
    return NextResponse.json({
      success: false,
      message: 'Bucket creation via API is not directly supported. Please run the migration SQL:',
      sql: createBucketSQL,
      instructions: [
        '1. Go to Supabase Dashboard > SQL Editor',
        '2. Run the SQL from: supabase/migrations/20251219000000_create_certificates_bucket.sql',
        '3. Or create the bucket manually in Dashboard > Storage > Create Bucket',
        '4. Bucket name: "certificates", Public: true, File size limit: 5MB, Allowed types: image/png'
      ],
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Check if bucket exists
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets()
    const certificatesBucket = buckets?.find((b: any) => b.id === 'certificates')

    return NextResponse.json({
      exists: !!certificatesBucket,
      bucket: certificatesBucket || null,
      message: certificatesBucket 
        ? 'Certificates bucket exists' 
        : 'Certificates bucket not found. Please create it.',
    })
  } catch (error: any) {
    return NextResponse.json(
      { exists: false, error: error.message },
      { status: 500 }
    )
  }
}


