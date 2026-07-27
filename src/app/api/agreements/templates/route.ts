import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import AgreementTemplate from '@/models/AgreementTemplate';

const INDIAN_LAW_TEMPLATES = [
  {
    type: 'NDA',
    name: 'Non-Disclosure Agreement (NDA)',
    description: 'Protect confidential business information shared between parties under Indian law.',
    content: `<div class="agreement-content">
<h1 style="text-align:center;">NON-DISCLOSURE AGREEMENT</h1>
<p style="text-align:center;">This Non-Disclosure Agreement ("Agreement") is entered into as of <strong>{{effectiveDate}}</strong></p>

<h2>PARTIES</h2>
<p><strong>Disclosing Party:</strong> {{disclosingPartyName}}, having its principal place of business at {{disclosingPartyAddress}} (hereinafter referred to as "Disclosing Party").</p>
<p><strong>Receiving Party:</strong> {{receivingPartyName}}, having its principal place of business at {{receivingPartyAddress}} (hereinafter referred to as "Receiving Party").</p>

<h2>RECITALS</h2>
<p>WHEREAS, the Disclosing Party possesses certain confidential and proprietary information relating to {{purposeOfDisclosure}} and desires to disclose such information to the Receiving Party for the purpose of evaluating a potential business relationship;</p>
<p>WHEREAS, the Receiving Party is willing to receive such confidential information and to protect the same from unauthorized use and disclosure;</p>
<p>NOW THEREFORE, in consideration of the mutual covenants and agreements set forth herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree as follows:</p>

<h2>1. DEFINITION OF CONFIDENTIAL INFORMATION</h2>
<p>For purposes of this Agreement, "Confidential Information" means any data or information that is proprietary to the Disclosing Party and not generally known to the public, whether in tangible or intangible form, whenever and however disclosed, including, but not limited to: (i) any marketing strategies, plans, financial information, or projections, operations, sales estimates, business plans and performance results; (ii) plans for products or services, and customer or supplier lists; (iii) any scientific or technical information, invention, design, process, procedure, formula, improvement, technology or method; (iv) any concepts, reports, data, know-how, works-in-progress, designs, development tools, specifications, computer software, source code, object code, flow charts, databases, inventions, information and trade secrets.</p>

<h2>2. OBLIGATIONS OF RECEIVING PARTY</h2>
<p>The Receiving Party agrees to: (a) hold the Confidential Information in strict confidence; (b) not to disclose the Confidential Information to any third parties without prior written consent; (c) use the Confidential Information solely for the purpose of {{purposeOfDisclosure}}; (d) protect the Confidential Information with at least the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care.</p>

<h2>3. TERM</h2>
<p>This Agreement shall remain in effect for a period of {{confidentialityPeriod}} years from the Effective Date, unless terminated earlier by mutual written agreement of the parties.</p>

<h2>4. RETURN OF INFORMATION</h2>
<p>Upon written request by the Disclosing Party, the Receiving Party shall promptly return or destroy all Confidential Information and any copies thereof.</p>

<h2>5. REMEDIES</h2>
<p>The Receiving Party acknowledges that any breach of this Agreement may cause irreparable harm to the Disclosing Party for which monetary damages would be inadequate. Accordingly, the Disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in addition to all other remedies available at law or in equity.</p>

<h2>6. GOVERNING LAW AND JURISDICTION</h2>
<p>This Agreement is governed by and construed in accordance with the Indian Contract Act, 1872, and other applicable laws of India. Any disputes arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of courts in {{jurisdiction}}.</p>

<h2>7. DISPUTE RESOLUTION</h2>
<p>Any dispute, controversy or claim arising out of or relating to this Agreement shall first be attempted to be resolved through good faith negotiations. If not resolved within 30 days, the dispute shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, with the seat of arbitration at {{jurisdiction}}.</p>

<h2>8. FORCE MAJEURE</h2>
<p>Neither party shall be liable for any failure or delay in performance under this Agreement due to circumstances beyond its reasonable control, including acts of God, natural disasters, pandemic, government actions, or other force majeure events as recognized under Indian law.</p>

<h2>9. ENTIRE AGREEMENT</h2>
<p>This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior agreements and understandings, whether written or oral.</p>

<h2>10. SEVERABILITY</h2>
<p>If any provision of this Agreement is held invalid or unenforceable, such provision shall be modified to the minimum extent necessary to make it valid and enforceable, and the validity and enforceability of all other provisions shall not be affected.</p>

<p style="margin-top:40px;"><strong>STAMP DUTY NOTICE:</strong> This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899, based on the jurisdiction of execution.</p>
</div>`,
    variables: [
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
      { key: 'disclosingPartyName', label: 'Disclosing Party Name', type: 'text', required: true },
      { key: 'disclosingPartyAddress', label: 'Disclosing Party Address', type: 'text', required: true },
      { key: 'receivingPartyName', label: 'Receiving Party Name', type: 'text', required: true },
      { key: 'receivingPartyAddress', label: 'Receiving Party Address', type: 'text', required: true },
      { key: 'purposeOfDisclosure', label: 'Purpose of Disclosure', type: 'text', required: true },
      { key: 'confidentialityPeriod', label: 'Confidentiality Period (Years)', type: 'number', required: true },
      { key: 'jurisdiction', label: 'Jurisdiction (City)', type: 'text', required: true },
    ],
    indianLawClauses: [
      'This Agreement is governed by and construed in accordance with the Indian Contract Act, 1872.',
      'Any disputes shall be subject to the exclusive jurisdiction of courts in the specified jurisdiction.',
      'This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899.',
      'Arbitration shall be conducted under the Arbitration and Conciliation Act, 1996.',
      'The consideration for this agreement is mutual exchange of confidential information for legitimate business purposes.',
    ],
  },
  {
    type: 'VENDOR_SUPPLY',
    name: 'Vendor Supply Agreement',
    description: 'Agreement between company and vendor for supply of goods or services.',
    content: `<div class="agreement-content">
<h1 style="text-align:center;">VENDOR SUPPLY AGREEMENT</h1>
<p style="text-align:center;">This Vendor Supply Agreement ("Agreement") is entered into as of <strong>{{effectiveDate}}</strong></p>

<h2>PARTIES</h2>
<p><strong>Company:</strong> {{companyName}}, a company incorporated under the Companies Act, 2013, having its registered office at {{companyAddress}}, CIN: {{companyCIN}} (hereinafter referred to as "Company").</p>
<p><strong>Vendor:</strong> {{vendorName}}, having its principal place of business at {{vendorAddress}}, GST No.: {{vendorGSTN}} (hereinafter referred to as "Vendor").</p>

<h2>1. SCOPE OF SUPPLY</h2>
<p>The Vendor agrees to supply the following goods/services to the Company: {{scopeOfSupply}}</p>
<p>The supply shall be in accordance with the specifications, quality standards, and delivery schedules as mutually agreed and set forth in Purchase Orders issued by the Company from time to time.</p>

<h2>2. TERM</h2>
<p>This Agreement shall commence on {{effectiveDate}} and shall remain in force for a period of {{contractDuration}} unless terminated earlier in accordance with the provisions hereof.</p>

<h2>3. PRICE AND PAYMENT</h2>
<p>3.1 The Vendor shall invoice the Company at the rates agreed in each Purchase Order, inclusive of all applicable taxes including GST as per the Goods and Services Tax Act, 2017.</p>
<p>3.2 Payment shall be made within {{paymentTermsDays}} days of receipt of valid tax invoice, subject to satisfactory delivery and acceptance.</p>
<p>3.3 The Company shall deduct Tax Deducted at Source (TDS) as applicable under the Income Tax Act, 1961, and issue Form 16A/26AS accordingly.</p>

<h2>4. QUALITY AND STANDARDS</h2>
<p>The Vendor warrants that all goods/services supplied shall: (a) conform to the agreed specifications; (b) be free from defects in material and workmanship; (c) comply with all applicable Indian Standards (IS) and Bureau of Indian Standards (BIS) requirements; (d) be accompanied by appropriate quality certificates and inspection reports.</p>

<h2>5. DELIVERY</h2>
<p>Delivery shall be made at {{deliveryLocation}}. Risk of loss and title shall pass to the Company upon delivery and acceptance. The Vendor shall provide advance intimation of delivery and obtain signed acknowledgment.</p>

<h2>6. INDEMNIFICATION</h2>
<p>The Vendor shall indemnify and hold harmless the Company from any claims, losses, damages, or expenses arising from: (a) defective goods/services; (b) infringement of intellectual property rights; (c) violation of applicable laws; (d) negligence or wilful misconduct of the Vendor's personnel.</p>

<h2>7. CONFIDENTIALITY</h2>
<p>Each party shall maintain the confidentiality of the other party's proprietary information and shall not disclose the same to any third party without prior written consent, in accordance with the Indian Contract Act, 1872.</p>

<h2>8. TERMINATION</h2>
<p>8.1 Either party may terminate this Agreement by giving {{noticePeriodDays}} days written notice.</p>
<p>8.2 The Company may terminate immediately upon: (a) material breach by the Vendor; (b) insolvency or liquidation of the Vendor; (c) repeated quality failures.</p>
<p>8.3 Upon termination, the Vendor shall complete all pending Purchase Orders unless otherwise instructed by the Company.</p>

<h2>9. GOVERNING LAW AND JURISDICTION</h2>
<p>This Agreement is governed by and construed in accordance with the Indian Contract Act, 1872, the Sale of Goods Act, 1930, and other applicable laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in {{jurisdiction}}.</p>

<h2>10. DISPUTE RESOLUTION</h2>
<p>Any dispute shall first be resolved through mutual negotiation within 30 days. If unresolved, disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, at {{jurisdiction}}.</p>

<h2>11. FORCE MAJEURE</h2>
<p>Neither party shall be in default if performance is prevented by circumstances beyond reasonable control including acts of God, government restrictions, pandemic, war, or other force majeure events. The affected party shall notify the other within 7 days of occurrence.</p>

<h2>12. ENTIRE AGREEMENT</h2>
<p>This Agreement, together with all Purchase Orders issued hereunder, constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements.</p>

<p style="margin-top:40px;"><strong>STAMP DUTY NOTICE:</strong> This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899, based on the jurisdiction of execution.</p>
</div>`,
    variables: [
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
      { key: 'companyName', label: 'Company Name', type: 'text', required: true },
      { key: 'companyAddress', label: 'Company Registered Address', type: 'text', required: true },
      { key: 'companyCIN', label: 'Company CIN', type: 'text', required: false },
      { key: 'vendorName', label: 'Vendor Name', type: 'text', required: true },
      { key: 'vendorAddress', label: 'Vendor Address', type: 'text', required: true },
      { key: 'vendorGSTN', label: 'Vendor GST Number', type: 'text', required: false },
      { key: 'scopeOfSupply', label: 'Scope of Supply', type: 'text', required: true },
      { key: 'contractDuration', label: 'Contract Duration (e.g. 1 year)', type: 'text', required: true },
      { key: 'paymentTermsDays', label: 'Payment Terms (Days)', type: 'number', required: true },
      { key: 'deliveryLocation', label: 'Delivery Location', type: 'text', required: true },
      { key: 'noticePeriodDays', label: 'Notice Period (Days)', type: 'number', required: true },
      { key: 'jurisdiction', label: 'Jurisdiction (City)', type: 'text', required: true },
    ],
    indianLawClauses: [
      'This Agreement is governed by and construed in accordance with the Indian Contract Act, 1872 and the Sale of Goods Act, 1930.',
      'GST shall be charged as per the Goods and Services Tax Act, 2017.',
      'TDS shall be deducted as applicable under the Income Tax Act, 1961.',
      'Any disputes shall be subject to the exclusive jurisdiction of courts in the specified jurisdiction.',
      'This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899.',
      'Arbitration shall be conducted under the Arbitration and Conciliation Act, 1996.',
    ],
  },
  {
    type: 'EMPLOYMENT',
    name: 'Employment Agreement',
    description: 'Standard employment agreement compliant with Indian labour laws.',
    content: `<div class="agreement-content">
<h1 style="text-align:center;">EMPLOYMENT AGREEMENT</h1>
<p style="text-align:center;">This Employment Agreement ("Agreement") is entered into as of <strong>{{effectiveDate}}</strong></p>

<h2>PARTIES</h2>
<p><strong>Employer:</strong> {{companyName}}, a company incorporated under the Companies Act, 2013, having its registered office at {{companyAddress}} (hereinafter referred to as "Employer" or "Company").</p>
<p><strong>Employee:</strong> {{employeeName}}, residing at {{employeeAddress}}, PAN: {{employeePAN}} (hereinafter referred to as "Employee").</p>

<h2>1. POSITION AND DUTIES</h2>
<p>The Employee is hereby appointed to the position of <strong>{{designation}}</strong> in the {{department}} department, reporting to {{reportingManager}}. The Employee shall perform such duties as are customarily associated with this position and such other duties as may be assigned by the Employer from time to time.</p>

<h2>2. COMMENCEMENT AND PROBATION</h2>
<p>Employment shall commence on {{joiningDate}}. The Employee shall be on probation for a period of {{probationPeriodMonths}} months, during which either party may terminate this Agreement with {{probationNoticeDays}} days' notice.</p>

<h2>3. COMPENSATION AND BENEFITS</h2>
<p>3.1 <strong>Cost to Company (CTC):</strong> The Employee shall receive an annual CTC of INR {{annualCTC}} (Rupees {{annualCTCWords}}).</p>
<p>3.2 <strong>Basic Salary:</strong> INR {{monthlySalary}} per month.</p>
<p>3.3 <strong>Provident Fund:</strong> The Employer shall contribute to Employee's Provident Fund as per the Employees' Provident Funds and Miscellaneous Provisions Act, 1952.</p>
<p>3.4 <strong>ESI:</strong> Where applicable, contributions shall be made under the Employees' State Insurance Act, 1948.</p>
<p>3.5 <strong>Gratuity:</strong> The Employee shall be eligible for gratuity as per the Payment of Gratuity Act, 1972, after completion of 5 years of continuous service.</p>
<p>3.6 <strong>Tax Deductions:</strong> All applicable TDS shall be deducted as per the Income Tax Act, 1961, and Form 16 shall be issued annually.</p>

<h2>4. WORKING HOURS AND LEAVE</h2>
<p>4.1 Standard working hours shall be {{workingHours}} per week.</p>
<p>4.2 The Employee shall be entitled to {{annualLeaveDays}} days of paid annual leave, {{sickLeaveDays}} days of sick leave, and public holidays as declared by the Employer.</p>
<p>4.3 Working hours shall comply with the applicable State Shops and Establishments Act.</p>

<h2>5. CONFIDENTIALITY AND NON-DISCLOSURE</h2>
<p>The Employee agrees to maintain strict confidentiality of all proprietary information, trade secrets, client data, and business strategies of the Employer during employment and for {{postEmploymentConfidentialityYears}} years thereafter, in accordance with the Indian Contract Act, 1872.</p>

<h2>6. INTELLECTUAL PROPERTY</h2>
<p>All inventions, developments, software, designs, and work products created by the Employee in the course of employment shall be the exclusive property of the Employer as works made for hire under applicable Indian intellectual property laws, including the Patents Act, 1970, and the Copyright Act, 1957.</p>

<h2>7. NON-COMPETE AND NON-SOLICITATION</h2>
<p>During employment, the Employee shall not engage in any activity that competes with the business of the Employer. Post termination, the Employee shall not solicit the Employer's clients or employees for a period of {{nonSolicitPeriodMonths}} months.</p>

<h2>8. TERMINATION</h2>
<p>8.1 After confirmation, either party may terminate this Agreement by providing {{noticePeriodDays}} days' written notice or payment in lieu thereof.</p>
<p>8.2 The Employer may terminate immediately for cause, including: (a) gross misconduct; (b) material breach of duties; (c) theft or fraud; (d) conviction of criminal offence.</p>
<p>8.3 Upon termination, the Employee shall receive all dues including unpaid salary, leave encashment, and statutory dues as per applicable law.</p>
<p>8.4 The Employee shall return all company property, equipment, and confidential information upon termination.</p>

<h2>9. DISPUTE RESOLUTION</h2>
<p>Any dispute arising out of employment or this Agreement shall first be attempted to be resolved through the Employer's grievance redressal mechanism. If unresolved, disputes shall be subject to the applicable labour laws and jurisdiction of courts in {{jurisdiction}}, subject to the Industrial Disputes Act, 1947, where applicable.</p>

<h2>10. GOVERNING LAW</h2>
<p>This Agreement is governed by and construed in accordance with the Indian Contract Act, 1872, and applicable Indian labour laws including the Industrial Employment (Standing Orders) Act, 1946, the Minimum Wages Act, 1948, and the Payment of Wages Act, 1936.</p>

<h2>11. EQUAL OPPORTUNITY</h2>
<p>The Employer is an equal opportunity employer and shall not discriminate on the basis of gender, caste, religion, or disability in accordance with applicable Indian laws including the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013.</p>

<p style="margin-top:40px;"><strong>STAMP DUTY NOTICE:</strong> This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899, based on the jurisdiction of execution.</p>
</div>`,
    variables: [
      { key: 'effectiveDate', label: 'Agreement Date', type: 'date', required: true },
      { key: 'companyName', label: 'Company Name', type: 'text', required: true },
      { key: 'companyAddress', label: 'Company Address', type: 'text', required: true },
      { key: 'employeeName', label: 'Employee Full Name', type: 'text', required: true },
      { key: 'employeeAddress', label: 'Employee Address', type: 'text', required: true },
      { key: 'employeePAN', label: 'Employee PAN', type: 'text', required: true },
      { key: 'designation', label: 'Designation/Job Title', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text', required: true },
      { key: 'reportingManager', label: 'Reporting Manager', type: 'text', required: true },
      { key: 'joiningDate', label: 'Date of Joining', type: 'date', required: true },
      { key: 'probationPeriodMonths', label: 'Probation Period (Months)', type: 'number', required: true },
      { key: 'probationNoticeDays', label: 'Probation Notice Period (Days)', type: 'number', required: true },
      { key: 'annualCTC', label: 'Annual CTC (INR)', type: 'number', required: true },
      { key: 'annualCTCWords', label: 'Annual CTC in Words', type: 'text', required: true },
      { key: 'monthlySalary', label: 'Monthly Basic Salary (INR)', type: 'number', required: true },
      { key: 'workingHours', label: 'Working Hours Per Week', type: 'number', required: true },
      { key: 'annualLeaveDays', label: 'Annual Leave Days', type: 'number', required: true },
      { key: 'sickLeaveDays', label: 'Sick Leave Days', type: 'number', required: true },
      { key: 'postEmploymentConfidentialityYears', label: 'Post-Employment Confidentiality (Years)', type: 'number', required: true },
      { key: 'nonSolicitPeriodMonths', label: 'Non-Solicitation Period (Months)', type: 'number', required: true },
      { key: 'noticePeriodDays', label: 'Notice Period (Days)', type: 'number', required: true },
      { key: 'jurisdiction', label: 'Jurisdiction (City)', type: 'text', required: true },
    ],
    indianLawClauses: [
      'This Agreement is governed by the Indian Contract Act, 1872, and applicable Indian labour laws.',
      'PF contributions as per the Employees\' Provident Funds and Miscellaneous Provisions Act, 1952.',
      'ESI contributions as per the Employees\' State Insurance Act, 1948, where applicable.',
      'Gratuity as per the Payment of Gratuity Act, 1972.',
      'TDS deductions as per the Income Tax Act, 1961.',
      'Compliance with the Sexual Harassment of Women at Workplace Act, 2013.',
      'Working hours per the applicable State Shops and Establishments Act.',
    ],
  },
  {
    type: 'SERVICE_AGREEMENT',
    name: 'Service Agreement',
    description: 'Agreement for provision of professional services between parties.',
    content: `<div class="agreement-content">
<h1 style="text-align:center;">SERVICE AGREEMENT</h1>
<p style="text-align:center;">This Service Agreement ("Agreement") is entered into as of <strong>{{effectiveDate}}</strong></p>

<h2>PARTIES</h2>
<p><strong>Client:</strong> {{clientName}}, having its principal place of business at {{clientAddress}}, GST No.: {{clientGSTN}} (hereinafter referred to as "Client").</p>
<p><strong>Service Provider:</strong> {{providerName}}, having its principal place of business at {{providerAddress}}, GST No.: {{providerGSTN}} (hereinafter referred to as "Service Provider").</p>

<h2>1. SERVICES</h2>
<p>The Service Provider agrees to provide the following services to the Client: <strong>{{servicesDescription}}</strong></p>
<p>The services shall be delivered in accordance with the specifications, timelines, and quality standards as mutually agreed and set forth in the Statement of Work (SOW) attached hereto as Exhibit A.</p>

<h2>2. TERM</h2>
<p>This Agreement shall commence on {{startDate}} and shall continue until {{endDate}}, unless terminated earlier in accordance with the provisions hereof.</p>

<h2>3. CONSIDERATION AND PAYMENT</h2>
<p>3.1 In consideration for the services rendered, the Client shall pay the Service Provider: {{paymentTerms}}</p>
<p>3.2 All invoices shall include applicable GST as per the Goods and Services Tax Act, 2017. The Service Provider shall issue GST-compliant tax invoices.</p>
<p>3.3 Payment shall be made within {{paymentDays}} days of receipt of valid invoice.</p>
<p>3.4 The Client shall deduct TDS as applicable under Section 194C/194J of the Income Tax Act, 1961, and issue Form 16A.</p>
<p>3.5 Late payments shall attract interest at {{latePaymentInterest}}% per month on the outstanding amount.</p>

<h2>4. DELIVERABLES AND MILESTONES</h2>
<p>The Service Provider shall deliver the agreed deliverables as per the timeline specified in the SOW. Acceptance criteria and approval process shall be as mutually agreed in writing.</p>

<h2>5. INTELLECTUAL PROPERTY</h2>
<p>5.1 Upon full payment, all deliverables, work products, and intellectual property created specifically for the Client under this Agreement shall vest in the Client.</p>
<p>5.2 The Service Provider retains all rights to its pre-existing intellectual property, tools, frameworks, and methodologies.</p>
<p>5.3 The Service Provider grants the Client a license to use such pre-existing IP to the extent necessary to use the deliverables.</p>

<h2>6. CONFIDENTIALITY</h2>
<p>Both parties agree to maintain strict confidentiality of the other party's proprietary information and shall not disclose the same to any third party without prior written consent, in accordance with the Indian Contract Act, 1872. This obligation shall survive termination for a period of {{confidentialityYears}} years.</p>

<h2>7. REPRESENTATIONS AND WARRANTIES</h2>
<p>The Service Provider represents and warrants that: (a) it has the legal authority to enter into this Agreement; (b) services will be performed by qualified professionals; (c) services will comply with applicable Indian laws and regulations; (d) it will not infringe any third-party intellectual property rights.</p>

<h2>8. LIMITATION OF LIABILITY</h2>
<p>The total liability of either party under this Agreement shall not exceed the total fees paid by the Client in the {{liabilityCapMonths}} months preceding the claim, except in cases of gross negligence, wilful misconduct, or breach of confidentiality obligations.</p>

<h2>9. TERMINATION</h2>
<p>9.1 Either party may terminate this Agreement by providing {{noticePeriodDays}} days' written notice.</p>
<p>9.2 Either party may terminate immediately upon material breach that remains uncured for 15 days after written notice.</p>
<p>9.3 Upon termination, the Client shall pay for all services rendered up to the date of termination.</p>

<h2>10. GOVERNING LAW AND JURISDICTION</h2>
<p>This Agreement is governed by and construed in accordance with the Indian Contract Act, 1872, the Information Technology Act, 2000 (where applicable), and other applicable laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in {{jurisdiction}}.</p>

<h2>11. DISPUTE RESOLUTION</h2>
<p>Any dispute shall first be attempted to be resolved through good faith negotiations within 30 days. If unresolved, disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, at {{jurisdiction}}. The arbitration shall be conducted in English.</p>

<h2>12. FORCE MAJEURE</h2>
<p>Neither party shall be liable for delays or failures in performance resulting from circumstances beyond its reasonable control, including acts of God, government actions, pandemic, civil disturbance, or failure of third-party services. The affected party shall provide prompt written notice and use reasonable efforts to resume performance.</p>

<h2>13. INDEPENDENT CONTRACTOR</h2>
<p>The Service Provider is an independent contractor and nothing in this Agreement shall be construed to create an employer-employee relationship, partnership, or joint venture between the parties.</p>

<p style="margin-top:40px;"><strong>STAMP DUTY NOTICE:</strong> This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899, based on the jurisdiction of execution.</p>
</div>`,
    variables: [
      { key: 'effectiveDate', label: 'Agreement Date', type: 'date', required: true },
      { key: 'clientName', label: 'Client Name', type: 'text', required: true },
      { key: 'clientAddress', label: 'Client Address', type: 'text', required: true },
      { key: 'clientGSTN', label: 'Client GST Number', type: 'text', required: false },
      { key: 'providerName', label: 'Service Provider Name', type: 'text', required: true },
      { key: 'providerAddress', label: 'Service Provider Address', type: 'text', required: true },
      { key: 'providerGSTN', label: 'Service Provider GST Number', type: 'text', required: false },
      { key: 'servicesDescription', label: 'Description of Services', type: 'text', required: true },
      { key: 'startDate', label: 'Start Date', type: 'date', required: true },
      { key: 'endDate', label: 'End Date', type: 'date', required: true },
      { key: 'paymentTerms', label: 'Payment Terms (e.g. INR 50,000 per month)', type: 'text', required: true },
      { key: 'paymentDays', label: 'Payment Due Days', type: 'number', required: true },
      { key: 'latePaymentInterest', label: 'Late Payment Interest (%)', type: 'number', required: true },
      { key: 'confidentialityYears', label: 'Confidentiality Period (Years)', type: 'number', required: true },
      { key: 'liabilityCapMonths', label: 'Liability Cap (Months)', type: 'number', required: true },
      { key: 'noticePeriodDays', label: 'Notice Period (Days)', type: 'number', required: true },
      { key: 'jurisdiction', label: 'Jurisdiction (City)', type: 'text', required: true },
    ],
    indianLawClauses: [
      'This Agreement is governed by and construed in accordance with the Indian Contract Act, 1872.',
      'GST shall be charged as per the Goods and Services Tax Act, 2017.',
      'TDS shall be deducted under Section 194C/194J of the Income Tax Act, 1961.',
      'Any disputes shall be subject to the exclusive jurisdiction of courts in the specified jurisdiction.',
      'This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899.',
      'Arbitration shall be conducted under the Arbitration and Conciliation Act, 1996.',
    ],
  },
  {
    type: 'MOU',
    name: 'Memorandum of Understanding (MOU)',
    description: 'Framework agreement expressing intent to collaborate between organizations.',
    content: `<div class="agreement-content">
<h1 style="text-align:center;">MEMORANDUM OF UNDERSTANDING</h1>
<p style="text-align:center;">This Memorandum of Understanding ("MOU") is entered into as of <strong>{{effectiveDate}}</strong></p>

<h2>PARTIES</h2>
<p><strong>Party A:</strong> {{partyAName}}, having its principal place of business at {{partyAAddress}} (hereinafter referred to as "Party A").</p>
<p><strong>Party B:</strong> {{partyBName}}, having its principal place of business at {{partyBAddress}} (hereinafter referred to as "Party B").</p>
<p>Party A and Party B are hereinafter collectively referred to as "Parties".</p>

<h2>BACKGROUND</h2>
<p>WHEREAS, the Parties desire to collaborate in the area of {{collaborationArea}} and wish to set forth their mutual understanding and intent with respect to such collaboration;</p>
<p>NOW THEREFORE, in consideration of the mutual covenants and premises set forth herein, the Parties agree as follows:</p>

<h2>1. PURPOSE AND SCOPE</h2>
<p>The purpose of this MOU is to establish a framework for cooperation between the Parties in the following areas: {{purposeAndScope}}</p>

<h2>2. NATURE OF UNDERSTANDING</h2>
<p>This MOU is intended to record the mutual understanding and intent of the Parties. Unless specifically stated to be legally binding, the provisions of this MOU are not intended to create legally enforceable obligations. Legally binding obligations shall only arise upon execution of definitive agreements between the Parties.</p>

<h2>3. COLLABORATIVE ACTIVITIES</h2>
<p>Subject to the execution of definitive agreements, the Parties intend to collaborate on the following activities: {{collaborativeActivities}}</p>

<h2>4. RESPONSIBILITIES OF PARTY A</h2>
<p>Party A agrees to: {{partyAResponsibilities}}</p>

<h2>5. RESPONSIBILITIES OF PARTY B</h2>
<p>Party B agrees to: {{partyBResponsibilities}}</p>

<h2>6. FINANCIAL ARRANGEMENTS</h2>
<p>{{financialArrangements}}</p>
<p>Any financial transactions between the Parties shall be subject to applicable taxes including GST as per the Goods and Services Tax Act, 2017, and TDS as per the Income Tax Act, 1961.</p>

<h2>7. INTELLECTUAL PROPERTY</h2>
<p>Each party shall retain ownership of its pre-existing intellectual property. Any jointly developed intellectual property shall be owned jointly by the Parties in equal shares unless otherwise agreed in a definitive agreement, in accordance with applicable Indian intellectual property laws.</p>

<h2>8. CONFIDENTIALITY</h2>
<p>The Parties agree to maintain confidentiality of all information shared pursuant to this MOU and shall not disclose the same to any third party without prior written consent, in accordance with the Indian Contract Act, 1872. This obligation shall survive termination for {{confidentialityYears}} years.</p>

<h2>9. TERM</h2>
<p>This MOU shall be effective from {{effectiveDate}} and shall remain in force for a period of {{mouDuration}}, unless earlier terminated by mutual written consent of the Parties or by either party upon {{noticePeriodDays}} days' written notice.</p>

<h2>10. NON-BINDING NATURE</h2>
<p>Save for the provisions on confidentiality (Clause 8), this MOU does not create any legally binding obligations on the Parties. Neither Party shall be obligated to enter into any definitive agreement as a result of this MOU.</p>

<h2>11. GOVERNING LAW AND JURISDICTION</h2>
<p>This MOU is governed by and construed in accordance with the Indian Contract Act, 1872, and other applicable laws of India. Any disputes arising out of binding provisions of this MOU shall be subject to the exclusive jurisdiction of courts in {{jurisdiction}}.</p>

<h2>12. DISPUTE RESOLUTION</h2>
<p>Any dispute arising from the binding provisions of this MOU shall first be attempted to be resolved through good faith negotiations. If unresolved within 30 days, disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, at {{jurisdiction}}.</p>

<h2>13. FORCE MAJEURE</h2>
<p>The performance obligations of either party under the binding provisions of this MOU shall be suspended in the event of and for the duration of a force majeure event, which shall mean any event beyond the reasonable control of a party including acts of God, pandemic, war, civil disturbance, or government actions.</p>

<h2>14. AMENDMENT</h2>
<p>This MOU may be amended only by mutual written consent of both Parties.</p>

<h2>15. ENTIRE AGREEMENT</h2>
<p>This MOU constitutes the entire understanding between the Parties with respect to its subject matter and supersedes all prior discussions and understandings relating thereto.</p>

<p style="margin-top:40px;"><strong>STAMP DUTY NOTICE:</strong> This MOU may be subject to stamp duty as per the Indian Stamp Act, 1899, if it creates legally binding obligations. Parties should seek legal advice on applicable stamp duty requirements.</p>
</div>`,
    variables: [
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
      { key: 'partyAName', label: 'Party A Name/Organization', type: 'text', required: true },
      { key: 'partyAAddress', label: 'Party A Address', type: 'text', required: true },
      { key: 'partyBName', label: 'Party B Name/Organization', type: 'text', required: true },
      { key: 'partyBAddress', label: 'Party B Address', type: 'text', required: true },
      { key: 'collaborationArea', label: 'Area of Collaboration', type: 'text', required: true },
      { key: 'purposeAndScope', label: 'Purpose and Scope', type: 'text', required: true },
      { key: 'collaborativeActivities', label: 'Collaborative Activities', type: 'text', required: true },
      { key: 'partyAResponsibilities', label: 'Party A Responsibilities', type: 'text', required: true },
      { key: 'partyBResponsibilities', label: 'Party B Responsibilities', type: 'text', required: true },
      { key: 'financialArrangements', label: 'Financial Arrangements', type: 'text', required: true },
      { key: 'confidentialityYears', label: 'Confidentiality Period (Years)', type: 'number', required: true },
      { key: 'mouDuration', label: 'MOU Duration (e.g. 2 years)', type: 'text', required: true },
      { key: 'noticePeriodDays', label: 'Notice Period (Days)', type: 'number', required: true },
      { key: 'jurisdiction', label: 'Jurisdiction (City)', type: 'text', required: true },
    ],
    indianLawClauses: [
      'This MOU is governed by and construed in accordance with the Indian Contract Act, 1872.',
      'Confidentiality obligations are legally binding under the Indian Contract Act, 1872.',
      'Any disputes shall be subject to the exclusive jurisdiction of courts in the specified jurisdiction.',
      'This MOU may be subject to stamp duty as per the Indian Stamp Act, 1899, if legally binding obligations arise.',
      'Arbitration shall be conducted under the Arbitration and Conciliation Act, 1996.',
      'Financial transactions shall comply with GST Act, 2017, and Income Tax Act, 1961.',
    ],
  },
];

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const count = await AgreementTemplate.countDocuments({ isActive: true });

    if (count === 0) {
      console.log('Seeding agreement templates...');
      await AgreementTemplate.insertMany(INDIAN_LAW_TEMPLATES);
      console.log('Agreement templates seeded successfully');
    }

    const templates = await AgreementTemplate.find({ isActive: true })
      .select('-content')
      .lean();

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('GET /api/agreements/templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type } = await req.json();
    if (!type) {
      return NextResponse.json({ error: 'Template type is required' }, { status: 400 });
    }

    const template = await AgreementTemplate.findOne({ type, isActive: true }).lean();
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('POST /api/agreements/templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
