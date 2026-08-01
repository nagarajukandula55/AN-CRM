import { NextRequest, NextResponse } from 'next/server';
import { listAgreementTemplates, getAgreementTemplateByType } from '@/lib/centralApiRead';


// GET/POST here now proxy to central-api's "agreementtemplates" dataset
// instead of a local model + lazy-seed-on-first-call. Per explicit
// direction: templates are centrally managed (any AN Group app can use
// them) and assignable to specific businesses from central-api's own
// admin dashboard, so this app no longer owns or edits the catalog --
// see lib/centralApiRead.ts's listAgreementTemplates()/
// getAgreementTemplateByType() and
// scripts/migrateAgreementTemplatesToCentral.ts for the one-time move of
// this file's INDIAN_LAW_TEMPLATES content to central-api.
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const businessId = req.headers.get('x-business-id') || req.headers.get('x-active-business-id') || undefined;
    const templates = await listAgreementTemplates(businessId);
    // Strip content for the list view, matching the previous local-model
    // behavior (full content only returned by the single-template POST
    // below).
    const withoutContent = templates.map(({ content, ...rest }) => rest);

    return NextResponse.json({ templates: withoutContent });
  } catch (error) {
    console.error('GET /api/agreements/templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type } = await req.json();
    if (!type) {
      return NextResponse.json({ error: 'Template type is required' }, { status: 400 });
    }

    const template = await getAgreementTemplateByType(type);
    if (!template || template.isActive === false) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('POST /api/agreements/templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
