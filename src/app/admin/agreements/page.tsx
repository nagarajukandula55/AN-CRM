'use client'

import React, { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'

// ─── Types ───────────────────────────────────────────────────────────────────

type AgreementType =
  | 'NDA'
  | 'EMPLOYMENT'
  | 'VENDOR'
  | 'SERVICE'
  | 'PARTNERSHIP'
  | 'LEASE'
  | 'CONSULTANCY'
  | 'FRANCHISE'
  | 'MOU'
  | 'CUSTOM'

type AgreementStatus =
  | 'DRAFT'
  | 'PENDING_SIGNATURE'
  | 'PARTIALLY_SIGNED'
  | 'FULLY_SIGNED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'

interface Party {
  name: string
  email: string
  role: string
  phone?: string
  address?: string
  panNumber?: string
}

interface Signature {
  partyEmail: string
  partyName: string
  partyRole?: string
  signedAt?: string
  otpVerified: boolean
}

interface Agreement {
  _id: string
  title: string
  type: AgreementType
  status: AgreementStatus
  parties: Party[]
  signatures?: Signature[]
  createdAt: string
  content: string
  governingLaw: string
  jurisdiction: string
  expiresAt?: string
}

// ─── Agreement Templates ──────────────────────────────────────────────────────

const AGREEMENT_TEMPLATES: Record<AgreementType, string> = {
  NDA: `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], a company/individual having its principal place of business/residence at _________________________ (hereinafter referred to as the "Disclosing Party");

AND

[PARTY_2_NAME], a company/individual having its principal place of business/residence at _________________________ (hereinafter referred to as the "Receiving Party").

The Disclosing Party and the Receiving Party are hereinafter collectively referred to as the "Parties" and individually as a "Party."

WHEREAS, the Disclosing Party possesses certain confidential and proprietary information relating to its business, technology, processes, trade secrets, customer data, and other commercially sensitive matters (collectively, "Confidential Information");

WHEREAS, the Receiving Party desires to receive such Confidential Information for the purpose of evaluating a potential business relationship or collaboration between the Parties (the "Purpose");

WHEREAS, the Disclosing Party is willing to disclose such Confidential Information to the Receiving Party solely for the Purpose and subject to the terms and conditions of this Agreement;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. DEFINITION OF CONFIDENTIAL INFORMATION
   1.1 "Confidential Information" means any and all information or data that has or could have commercial value or other utility in the business in which Disclosing Party is engaged, including but not limited to: trade secrets, financial information, business plans, customer lists, supplier information, technical data, software code, algorithms, product specifications, research and development data, marketing strategies, pricing information, and any other information that the Disclosing Party designates as confidential at the time of disclosure or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure.
   1.2 This Agreement is governed by the provisions of the Indian Contract Act, 1872, and the Information Technology Act, 2000, as applicable to confidential and proprietary information.

2. OBLIGATIONS OF RECEIVING PARTY
   2.1 The Receiving Party agrees to: (a) hold the Confidential Information in strict confidence and take all reasonable precautions to protect such Confidential Information (including all precautions the Receiving Party employs with respect to its own confidential materials); (b) not disclose any Confidential Information to any third party without the prior written consent of the Disclosing Party; (c) not use any Confidential Information for any purpose except the Purpose; and (d) limit access to Confidential Information to those of its employees, contractors, and agents who have a need to know such information for the Purpose.

3. TERM
   3.1 This Agreement shall be effective as of the Effective Date and shall remain in force for a period of three (3) years from the Effective Date, unless earlier terminated by mutual written agreement of the Parties.
   3.2 Notwithstanding termination of this Agreement, the obligations of confidentiality shall survive for a further period of three (3) years from the date of termination.

4. EXCLUSIONS FROM CONFIDENTIALITY
   4.1 The obligations of this Agreement shall not apply to information that: (a) is or becomes publicly available through no fault of the Receiving Party; (b) was known to the Receiving Party prior to disclosure by the Disclosing Party, as evidenced by written records; (c) is independently developed by the Receiving Party without reference to the Confidential Information; (d) is rightfully obtained from a third party without any obligation of confidentiality; or (e) is required to be disclosed by law, regulation, or court order, provided that the Receiving Party gives prompt written notice to the Disclosing Party before such disclosure and cooperates with the Disclosing Party in seeking a protective order.

5. INTELLECTUAL PROPERTY
   5.1 Nothing in this Agreement shall be construed as granting any rights, by license or otherwise, to any Confidential Information, or to any invention or any patent, copyright, trademark, trade secret, or other intellectual property right except as expressly set out herein.
   5.2 All Confidential Information remains the sole property of the Disclosing Party.

6. RETURN OR DESTRUCTION OF INFORMATION
   6.1 Upon written request by the Disclosing Party, the Receiving Party shall promptly return or destroy all tangible materials embodying Confidential Information (in any form and including all copies or reproductions), and certify in writing such return or destruction within seven (7) business days of receipt of such request.

7. REMEDIES
   7.1 The Receiving Party acknowledges that breach of this Agreement may cause irreparable harm to the Disclosing Party for which monetary damages may be inadequate.
   7.2 In addition to any other rights and remedies, the Disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in accordance with the provisions of the Specific Relief Act, 1963.

8. REPRESENTATIONS AND WARRANTIES
   8.1 Each Party represents and warrants that: (a) it has full authority to enter into this Agreement; (b) this Agreement constitutes a valid and binding obligation; and (c) the execution and performance of this Agreement does not violate any applicable law or agreement.

9. GOVERNING LAW AND DISPUTE RESOLUTION
   9.1 This Agreement shall be governed by and construed in accordance with the Laws of India.
   9.2 Any dispute arising out of or in connection with this Agreement, including any question regarding its existence, validity, or termination, shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996 (India), as amended from time to time.
   9.3 The seat of arbitration shall be _________________________, India. The arbitration proceedings shall be conducted in English. The arbitral tribunal shall consist of a sole arbitrator mutually agreed upon by the Parties.

10. GENERAL PROVISIONS
    10.1 This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior and contemporaneous agreements, understandings, negotiations, and discussions, whether oral or written.
    10.2 This Agreement may not be amended except by a written instrument signed by both Parties.
    10.3 If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.
    10.4 The failure of either Party to enforce any right or provision of this Agreement shall not constitute a waiver of such right or provision.
    10.5 Notices under this Agreement shall be in writing and delivered by email (with confirmation), courier, or registered post to the addresses set forth above.

IN WITNESS WHEREOF, the Parties have executed this Non-Disclosure Agreement as of the date first written above.

DISCLOSING PARTY                          RECEIVING PARTY
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Title:     ____________________           Title:     ____________________
Date:      ____________________           Date:      ____________________`,

  EMPLOYMENT: `EMPLOYMENT AGREEMENT

This Employment Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], a company incorporated under the Companies Act, 2013, having its registered office at _________________________ (hereinafter referred to as the "Employer" or "Company");

AND

[PARTY_2_NAME], residing at _________________________, holding PAN _________________________ (hereinafter referred to as the "Employee").

WHEREAS, the Company desires to employ the Employee in the capacity described herein, and the Employee desires to accept such employment, on the terms and conditions set forth in this Agreement;

WHEREAS, this Agreement is made in compliance with applicable labour laws of India including, without limitation, the Shops and Commercial Establishments Act (as applicable to the relevant state), the Payment of Wages Act, 1936, the Employees' Provident Funds and Miscellaneous Provisions Act, 1952, the Payment of Gratuity Act, 1972, the Maternity Benefit Act, 1961, and the Industrial Disputes Act, 1947, as applicable;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. POSITION AND DUTIES
   1.1 The Company agrees to employ the Employee in the position of _________________________ (the "Position"), reporting to _________________________.
   1.2 The Employee shall perform such duties and responsibilities as are customarily associated with such position and as may be assigned from time to time by the Company.
   1.3 The Employee shall devote full working time, attention, and best efforts exclusively to the performance of duties for the Company during working hours.

2. COMMENCEMENT AND PROBATION
   2.1 The employment shall commence on the Effective Date.
   2.2 The Employee shall be on probation for a period of six (6) months from the Effective Date ("Probation Period"). During the Probation Period, either Party may terminate this Agreement by giving fifteen (15) days' written notice.
   2.3 Upon successful completion of the Probation Period, the Employee shall be confirmed as a permanent employee, subject to satisfactory performance review.

3. COMPENSATION
   3.1 The Company shall pay the Employee a gross monthly salary of INR _________________________ (Indian Rupees _________________________), subject to applicable tax deductions at source (TDS) as per the Income Tax Act, 1961.
   3.2 The salary shall be paid on or before the 7th working day of each calendar month by direct bank transfer.
   3.3 The salary structure shall include Basic Salary, House Rent Allowance (HRA), and other allowances as detailed in Schedule A attached hereto.
   3.4 The Company shall review Employee's compensation on an annual basis; however, no increase is guaranteed.

4. PROVIDENT FUND AND ESI CONTRIBUTIONS
   4.1 The Company and the Employee shall each contribute to the Employee's Provident Fund (EPF) account in accordance with the Employees' Provident Funds and Miscellaneous Provisions Act, 1952, at the rate of twelve percent (12%) of the Employee's basic salary, or such other rate as may be prescribed under applicable law.
   4.2 Employee State Insurance (ESI) contributions shall be made as applicable per the Employees' State Insurance Act, 1948, based on the Employee's gross salary.

5. WORKING HOURS AND LEAVE
   5.1 Standard working hours shall be _________________________ hours per week, excluding meal breaks, as per the applicable Shops and Establishments Act.
   5.2 The Employee shall be entitled to leaves as per the Company's leave policy and applicable state labour laws, including earned leave, casual leave, sick leave, and public holidays.

6. GRATUITY
   6.1 Upon completion of continuous service of five (5) years or more, the Employee shall be entitled to gratuity as per the Payment of Gratuity Act, 1972, calculated at the rate of fifteen (15) days' wages for every completed year of service, subject to a maximum as prescribed under the Act.

7. CONFIDENTIALITY
   7.1 During the term of employment and for a period of three (3) years thereafter, the Employee shall not disclose to any third party, or use for any purpose other than in furtherance of the Company's business, any confidential information, trade secrets, or proprietary information of the Company.
   7.2 Upon termination of employment, the Employee shall immediately return all Company property, documents, and data.

8. INTELLECTUAL PROPERTY
   8.1 All inventions, discoveries, developments, improvements, software, works of authorship, and other intellectual property made, developed, or conceived by the Employee, solely or jointly, in the course of employment or using the Company's resources, shall be the exclusive property of the Company and are hereby assigned to the Company.
   8.2 The Employee agrees to execute such documents and take such actions as may be necessary to perfect the Company's rights in such intellectual property.

9. NON-COMPETE AND NON-SOLICITATION
   9.1 During the employment and for a period of twelve (12) months following termination, the Employee shall not, directly or indirectly, engage in, own, manage, operate, or be employed by any business that competes with the Company's core business within _________________________.
   9.2 During the employment and for a period of twelve (12) months following termination, the Employee shall not directly or indirectly solicit or hire any employee of the Company or solicit any customer of the Company.

10. NOTICE PERIOD AND TERMINATION
    10.1 After confirmation of employment, either Party may terminate this Agreement by providing ninety (90) days' written notice to the other Party.
    10.2 The Company may, at its sole discretion, elect to pay the Employee's salary in lieu of serving the notice period (Garden Leave).
    10.3 Notwithstanding the above, the Company may terminate this Agreement with immediate effect (without notice or payment in lieu) in cases of gross misconduct, fraud, willful neglect of duty, material breach of this Agreement, or criminal conduct.
    10.4 Upon termination, the Company shall settle all dues including unpaid salary, accrued leave encashment, and other statutory entitlements within thirty (30) days.

11. GOVERNING LAW AND DISPUTE RESOLUTION
    11.1 This Agreement shall be governed by and construed in accordance with the Laws of India.
    11.2 Any dispute arising under this Agreement shall first be attempted to be resolved by mutual negotiation within thirty (30) days.
    11.3 If unresolved, disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be _________________________, India.

12. GENERAL
    12.1 This Agreement constitutes the entire agreement between the Parties and supersedes all prior understandings.
    12.2 Amendments must be in writing and signed by both Parties.
    12.3 If any provision is held invalid, the remainder of the Agreement continues in force.

IN WITNESS WHEREOF, the Parties have executed this Employment Agreement as of the date first written above.

EMPLOYER                                  EMPLOYEE
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Authorized Signatory                      Employee
Name:      ____________________           Name:      ____________________
Title:     ____________________           Date:      ____________________
Date:      ____________________`,

  VENDOR: `VENDOR AGREEMENT

This Vendor Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], a company/entity having its principal place of business at _________________________ (hereinafter referred to as the "Buyer" or "Company");

AND

[PARTY_2_NAME], a company/entity having its principal place of business at _________________________, bearing GSTIN _________________________ (hereinafter referred to as the "Vendor" or "Supplier").

WHEREAS, the Buyer desires to procure goods and/or services from the Vendor on the terms and conditions set forth herein;

WHEREAS, the Vendor desires to supply such goods and/or services to the Buyer on such terms and conditions;

WHEREAS, the Parties intend this Agreement to comply with applicable Indian laws including the Micro, Small and Medium Enterprises Development Act, 2006 (MSMED Act), the Central Goods and Services Tax Act, 2017, and other applicable statutes;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. SCOPE OF SUPPLY
   1.1 The Vendor shall supply goods and/or services as specified in purchase orders issued by the Buyer from time to time ("Purchase Orders"), each of which shall be incorporated into and form part of this Agreement.
   1.2 The Vendor shall supply goods/services in strict conformity with specifications, samples, and standards agreed upon in the Purchase Order.
   1.3 All deliveries shall be made to the location specified in the Purchase Order, at the Vendor's cost unless otherwise agreed.

2. PRICING AND PAYMENT TERMS
   2.1 Prices shall be as agreed in each Purchase Order and shall remain fixed for the duration of such order unless revised by mutual written agreement.
   2.2 All prices shall be exclusive of applicable taxes (GST, customs duties, etc.) unless explicitly stated otherwise.
   2.3 The Buyer shall make payment within forty-five (45) days from the date of receipt of goods/services and a valid tax invoice, in compliance with the MSMED Act, 2006, applicable to Micro and Small Enterprises.
   2.4 For suppliers registered as Medium Enterprises, payment shall be made within the period agreed in writing, not exceeding forty-five (45) days from delivery/acceptance.
   2.5 In the event of delayed payment, interest shall be payable by the Buyer at the rate specified under the MSMED Act, 2006 (currently three times the bank rate notified by RBI).

3. GST COMPLIANCE
   3.1 The Vendor shall ensure compliance with all provisions of the Central Goods and Services Tax Act, 2017, Integrated Goods and Services Tax Act, 2017, and applicable State GST Acts.
   3.2 The Vendor shall issue valid GST invoices for all supplies and shall timely file all GST returns.
   3.3 The Vendor shall ensure that Input Tax Credit (ITC) is made available to the Buyer with respect to all eligible supplies.
   3.4 Any GST demands, penalties, or interest arising due to the Vendor's failure to file returns or pay tax shall be borne exclusively by the Vendor.

4. QUALITY STANDARDS AND INSPECTION
   4.1 The Vendor warrants that all goods and services shall conform to the agreed specifications, quality standards, and applicable Indian Standards (BIS standards) as notified.
   4.2 The Buyer reserves the right to inspect and test goods at the Vendor's premises prior to dispatch and/or upon delivery.
   4.3 Goods failing to meet quality standards shall be rejected and returned at the Vendor's cost. The Vendor shall replace rejected goods within the time specified by the Buyer.
   4.4 Acceptance of goods shall not be deemed a waiver of any defect that could not reasonably be identified at the time of inspection.

5. DELIVERY AND DELAYS
   5.1 Time is of the essence in this Agreement. The Vendor shall deliver goods/services by the date(s) specified in each Purchase Order.
   5.2 In the event of delay attributable to the Vendor, the Buyer reserves the right to levy liquidated damages at the rate of ___% of the Purchase Order value per week of delay, up to a maximum of ___% of the total Purchase Order value.
   5.3 Force majeure events (acts of God, war, government actions) shall excuse performance for the duration of the force majeure event, subject to prompt written notice.

6. INDEMNIFICATION
   6.1 The Vendor shall indemnify, defend, and hold harmless the Buyer and its officers, directors, employees, and agents from and against any and all claims, liabilities, losses, damages, costs, and expenses (including reasonable legal fees) arising out of or resulting from: (a) the Vendor's breach of this Agreement; (b) any defect in goods or services supplied; (c) any infringement of third-party intellectual property rights; (d) the Vendor's negligence or willful misconduct; or (e) the Vendor's non-compliance with applicable laws.

7. CONFIDENTIALITY
   7.1 The Vendor shall treat all information relating to the Buyer's business, operations, customers, pricing, and technology as strictly confidential and shall not disclose such information to any third party without prior written consent.
   7.2 Confidentiality obligations shall survive termination of this Agreement for a period of three (3) years.

8. INTELLECTUAL PROPERTY
   8.1 Any designs, specifications, tooling, or other materials provided by the Buyer to the Vendor shall remain the exclusive property of the Buyer.
   8.2 Any intellectual property created by the Vendor specifically for the Buyer pursuant to this Agreement shall be assigned to and owned by the Buyer.

9. TERM AND TERMINATION
   9.1 This Agreement shall commence on the Effective Date and continue for a period of one (1) year, unless earlier terminated.
   9.2 Either Party may terminate this Agreement by giving sixty (60) days' written notice.
   9.3 Either Party may terminate this Agreement immediately upon written notice if the other Party commits a material breach that remains uncured for thirty (30) days after notice.

10. COMPLIANCE WITH LAWS
    10.1 The Vendor shall comply with all applicable laws, regulations, and standards including labour laws, environmental regulations, anti-corruption laws, and product safety standards.
    10.2 The Vendor shall not engage in child labour, forced labour, or any other practice prohibited under Indian law.

11. GOVERNING LAW AND DISPUTE RESOLUTION
    11.1 This Agreement shall be governed by and construed in accordance with the Laws of India.
    11.2 Any dispute arising out of or in connection with this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be _________________________, India, with proceedings conducted in English before a sole arbitrator.

12. GENERAL PROVISIONS
    12.1 This Agreement constitutes the entire agreement between the Parties and supersedes all prior agreements and understandings.
    12.2 No waiver of any breach shall constitute a waiver of any subsequent breach.
    12.3 This Agreement may not be assigned without the prior written consent of the other Party.

IN WITNESS WHEREOF, the Parties have executed this Vendor Agreement as of the date first written above.

BUYER                                     VENDOR
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Title:     ____________________           Title:     ____________________
Date:      ____________________           Date:      ____________________`,

  SERVICE: `SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], a company/individual having its principal place of business at _________________________ (hereinafter referred to as the "Client");

AND

[PARTY_2_NAME], a company/individual having its principal place of business at _________________________ (hereinafter referred to as the "Service Provider").

WHEREAS, the Client desires to engage the Service Provider to provide certain professional services as described herein;

WHEREAS, the Service Provider desires to provide such services to the Client on the terms and conditions set forth herein;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. SCOPE OF SERVICES
   1.1 The Service Provider agrees to provide the following services ("Services") to the Client:
       (a) _________________________
       (b) _________________________
       (c) _________________________
   1.2 The specific deliverables, timelines, and acceptance criteria for each phase of Services shall be as set out in one or more Statements of Work ("SOW") executed by the Parties, which shall form part of this Agreement.
   1.3 Any changes to the scope of Services must be agreed in writing by both Parties via a Change Order.

2. DELIVERABLES AND TIMELINES
   2.1 The Service Provider shall deliver all Deliverables as per the timelines set out in the applicable SOW.
   2.2 Deliverables shall be deemed accepted by the Client if: (a) the Client provides written acceptance; or (b) the Client fails to provide written rejection with reasons within ten (10) business days of delivery.
   2.3 Time is of the essence with respect to all delivery timelines.

3. SERVICE LEVEL AGREEMENT (SLA)
   3.1 The Service Provider shall maintain the following service levels:
       (a) Response time to Client queries: within four (4) business hours;
       (b) Resolution of critical issues: within twenty-four (24) hours;
       (c) Availability of Service (if applicable): ___% uptime per month;
       (d) Regular status reports: weekly or as agreed in the SOW.
   3.2 Failure to meet SLA metrics shall entitle the Client to service credits as specified in the SOW.

4. FEES AND PAYMENT
   4.1 The Client shall pay the Service Provider fees as set out in the applicable SOW.
   4.2 The Service Provider shall issue invoices on a _________________________ basis (monthly/milestone-based/project-based).
   4.3 Payment shall be due within thirty (30) days of the date of invoice.
   4.4 Late payments shall attract interest at the rate of eighteen percent (18%) per annum from the due date.
   4.5 All fees are exclusive of applicable taxes (GST, TDS, etc.) which shall be borne by the respective Party as required by law.

5. INTELLECTUAL PROPERTY
   5.1 All pre-existing intellectual property of each Party shall remain the property of that Party.
   5.2 All intellectual property, including but not limited to software, code, documentation, designs, and other works, created by the Service Provider specifically for the Client under this Agreement ("Work Product") shall, upon full payment by the Client, be assigned to and owned exclusively by the Client.
   5.3 The Service Provider hereby irrevocably assigns to the Client all rights, title, and interest in and to the Work Product, including all intellectual property rights therein, under the Copyright Act, 1957, and other applicable Indian laws.
   5.4 The Service Provider shall retain the right to use general skills and knowledge (but not Client's Confidential Information) in future engagements.

6. CONFIDENTIALITY
   6.1 Each Party agrees to maintain the confidentiality of the other Party's Confidential Information using no less care than it uses to protect its own confidential information (and in no event less than reasonable care).
   6.2 Confidentiality obligations shall survive termination of this Agreement for three (3) years.

7. LIMITATION OF LIABILITY
   7.1 Neither Party shall be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, revenue, data, goodwill, or business interruption, even if advised of the possibility of such damages.
   7.2 The Service Provider's total aggregate liability under this Agreement shall not exceed the total fees paid by the Client to the Service Provider in the three (3) months preceding the event giving rise to liability.
   7.3 The limitations in this clause shall not apply to: (a) death or personal injury caused by negligence; (b) fraud or fraudulent misrepresentation; or (c) any other liability that cannot be excluded by law.

8. REPRESENTATIONS AND WARRANTIES
   8.1 The Service Provider represents and warrants that: (a) it has the requisite skill, experience, and expertise to perform the Services; (b) the Services shall be performed in a professional and workmanlike manner; (c) the Work Product shall not infringe any third-party intellectual property rights; and (d) it has the right to enter into this Agreement.

9. TERM AND TERMINATION
   9.1 This Agreement shall commence on the Effective Date and continue until all Services under applicable SOWs have been completed, unless earlier terminated.
   9.2 Either Party may terminate this Agreement for convenience by providing thirty (30) days' written notice.
   9.3 Either Party may terminate this Agreement immediately upon written notice if the other Party commits a material breach that remains uncured for fifteen (15) days after written notice.
   9.4 Upon termination, the Client shall pay for all Services performed and accepted up to the date of termination.

10. INDEPENDENT CONTRACTOR
    10.1 The Service Provider is an independent contractor and not an employee, agent, or partner of the Client.
    10.2 The Service Provider shall be responsible for all taxes, social security contributions, and insurance applicable to its personnel.

11. GOVERNING LAW AND DISPUTE RESOLUTION
    11.1 This Agreement shall be governed by and construed in accordance with the Laws of India.
    11.2 Any dispute arising out of or in connection with this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be _________________________, India.

12. MISCELLANEOUS
    12.1 This Agreement (including all SOWs) constitutes the entire agreement between the Parties with respect to the subject matter.
    12.2 Amendments must be in writing and signed by authorized representatives of both Parties.
    12.3 Neither Party may assign its rights or obligations under this Agreement without the prior written consent of the other Party.

IN WITNESS WHEREOF, the Parties have executed this Service Agreement as of the date first written above.

CLIENT                                    SERVICE PROVIDER
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Title:     ____________________           Title:     ____________________
Date:      ____________________           Date:      ____________________`,

  PARTNERSHIP: `PARTNERSHIP AGREEMENT

This Partnership Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], residing/having its place of business at _________________________ (hereinafter referred to as "Partner 1");

AND

[PARTY_2_NAME], residing/having its place of business at _________________________ (hereinafter referred to as "Partner 2").

Partner 1 and Partner 2 are collectively referred to as the "Partners" and individually as a "Partner."

WHEREAS, the Partners desire to carry on business together in partnership for their mutual benefit;

WHEREAS, the Partners desire to set forth their respective rights, duties, and obligations in relation to such partnership;

WHEREAS, this Agreement is made in accordance with the provisions of the Indian Partnership Act, 1932;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. FORMATION AND NAME
   1.1 The Partners hereby form a partnership ("Partnership") under the Indian Partnership Act, 1932.
   1.2 The firm name of the Partnership shall be _________________________ ("Firm Name").
   1.3 The Partnership shall be registered with the Registrar of Firms as required under the Indian Partnership Act, 1932.
   1.4 The principal place of business of the Partnership shall be _________________________.

2. NATURE OF BUSINESS
   2.1 The Partnership is formed for the purpose of carrying on the following business: _________________________.
   2.2 The Partnership may expand or alter its business activities with the unanimous consent of all Partners.

3. TERM
   3.1 The Partnership shall commence on the Effective Date and shall continue until dissolved in accordance with the provisions of this Agreement or the Indian Partnership Act, 1932.

4. CAPITAL CONTRIBUTION
   4.1 Each Partner shall contribute capital to the Partnership as follows:
       Partner 1: INR _________________________ (Indian Rupees _________________________)
       Partner 2: INR _________________________ (Indian Rupees _________________________)
   4.2 Additional capital may be introduced from time to time by mutual agreement, and such contributions shall be documented in writing.
   4.3 Capital contributions shall not carry interest unless specifically agreed in writing by all Partners.

5. PROFIT AND LOSS SHARING
   5.1 The net profits and losses of the Partnership shall be shared between the Partners in the following ratio:
       Partner 1: _____% (_____ percent)
       Partner 2: _____% (_____ percent)
   5.2 Profits shall be distributed at such intervals as the Partners may determine by unanimous agreement, but no less frequently than annually.
   5.3 Each Partner shall be entitled to draw against anticipated profits as mutually agreed, subject to availability of funds.

6. MANAGEMENT AND DECISION MAKING
   6.1 Each Partner shall have equal authority to manage the day-to-day operations of the Partnership.
   6.2 Ordinary business decisions shall require the agreement of a majority of Partners by capital contribution.
   6.3 The following decisions shall require the unanimous written consent of all Partners: (a) admission of a new partner; (b) expulsion of a partner; (c) changes to this Agreement; (d) sale or mortgage of partnership property; (e) commencement of legal proceedings; (f) any borrowing exceeding INR _________________________; (g) significant changes in the nature of business.
   6.4 Each Partner shall devote such time and attention to the Partnership business as required for its effective management.

7. BANKING AND ACCOUNTS
   7.1 A separate bank account shall be maintained in the name of the firm.
   7.2 All Partnership funds shall be deposited in such account and withdrawals shall be made only for Partnership purposes.
   7.3 Proper books of account shall be maintained and shall be open to inspection by any Partner at all times.
   7.4 Accounts shall be prepared and audited annually.

8. DUTIES OF PARTNERS
   8.1 Each Partner shall: (a) devote reasonable time to the Partnership business; (b) act in good faith in the best interests of the Partnership; (c) disclose all relevant information to other Partners; (d) not compete with the Partnership or engage in any conflicting business without written consent of all Partners; (e) account for any profit made from any transaction concerning the Partnership without consent.

9. RETIREMENT OF A PARTNER
   9.1 A Partner may retire from the Partnership by giving not less than sixty (60) days' written notice to the other Partner(s).
   9.2 Upon retirement, the retiring Partner shall be entitled to receive the value of their capital account plus their share of any undistributed profits, calculated as of the date of retirement.
   9.3 The goodwill of the firm shall be valued as per a mutually agreed method or, failing agreement, by an independent valuer.

10. DISSOLUTION OF PARTNERSHIP
    10.1 The Partnership may be dissolved by: (a) mutual written consent of all Partners; (b) the death, insolvency, or permanent incapacity of any Partner (unless the surviving Partner(s) elect to continue); (c) a court order under the Indian Partnership Act, 1932; (d) completion of the purpose for which it was formed.
    10.2 Upon dissolution, the firm's assets shall first be applied to discharge liabilities to third parties, then to repay Partners' capital contributions, and any surplus shall be distributed in the profit-sharing ratio.

11. GOVERNING LAW AND DISPUTE RESOLUTION
    11.1 This Agreement shall be governed by and construed in accordance with the Laws of India, including the Indian Partnership Act, 1932.
    11.2 Any dispute arising out of or in connection with this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be _________________________, India.

12. GENERAL PROVISIONS
    12.1 This Agreement constitutes the entire agreement between the Partners with respect to the Partnership.
    12.2 Amendments must be in writing and signed by all Partners.
    12.3 If any provision is invalid or unenforceable, the remaining provisions continue in force.

IN WITNESS WHEREOF, the Partners have executed this Partnership Agreement as of the date first written above.

PARTNER 1                                 PARTNER 2
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Date:      ____________________           Date:      ____________________

WITNESS 1                                 WITNESS 2
Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________`,

  LEASE: `LEASE AGREEMENT

This Lease Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], residing/having its principal office at _________________________ (hereinafter referred to as the "Lessor" or "Landlord");

AND

[PARTY_2_NAME], residing/having its principal office at _________________________ (hereinafter referred to as the "Lessee" or "Tenant").

WHEREAS, the Lessor is the lawful owner of the property described herein and desires to lease the same to the Lessee;

WHEREAS, the Lessee desires to take the said property on lease from the Lessor on the terms and conditions set forth herein;

WHEREAS, this Agreement is made in accordance with the provisions of the Transfer of Property Act, 1882, and the applicable Rent Control legislation of the State of _________________________;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. DESCRIPTION OF PREMISES
   1.1 The Lessor agrees to lease to the Lessee and the Lessee agrees to take on lease from the Lessor the following property ("Premises"):
       Property Address: _________________________
       Area: approximately _________________________ sq. ft. / sq. m.
       Description: _________________________ (e.g., commercial office space / residential apartment)
   1.2 The Premises are leased for the purpose of _________________________ only and for no other purpose.

2. TERM
   2.1 The lease shall commence on _________________________ ("Commencement Date") and shall continue for a period of _________________________ months/years ("Lease Term"), unless earlier terminated in accordance with this Agreement.
   2.2 Lock-in Period: Notwithstanding Clause 2.1, neither Party shall terminate this Agreement during the lock-in period of _________________________ months from the Commencement Date ("Lock-In Period"), except in cases of material breach.
   2.3 Renewal: This Agreement may be renewed for a further period upon mutual written consent of both Parties at least sixty (60) days prior to expiry.

3. RENT
   3.1 The Lessee shall pay the Lessor a monthly rent of INR _________________________ (Indian Rupees _________________________) ("Monthly Rent") per month.
   3.2 Rent shall be payable on or before the 5th day of each calendar month, in advance, by cheque, bank transfer, or such other mode as agreed.
   3.3 The Lessor shall provide a valid rent receipt for each payment received.
   3.4 Rent Escalation: The Monthly Rent shall be subject to an escalation of _____% per annum, effective from each anniversary of the Commencement Date.
   3.5 Late Payment: Any rent not received by the 10th of the month shall attract a late payment charge of _____% of the monthly rent per month of delay.

4. SECURITY DEPOSIT
   4.1 Upon execution of this Agreement, the Lessee shall pay to the Lessor a refundable security deposit of INR _________________________ (Indian Rupees _________________________) ("Security Deposit"), equivalent to _____ months' rent.
   4.2 The Security Deposit shall be held by the Lessor interest-free and shall be refunded to the Lessee within thirty (30) days of the Lessee vacating the Premises and handing over possession, subject to deductions for: (a) unpaid rent or charges; (b) damage to the Premises beyond fair wear and tear; (c) any other dues under this Agreement.
   4.3 The Security Deposit shall not be adjusted against rent.

5. MAINTENANCE AND REPAIRS
   5.1 The Lessor shall be responsible for: (a) structural repairs and maintenance of the building; (b) major repairs to plumbing, electrical systems, and other infrastructure; (c) common area maintenance (if applicable).
   5.2 The Lessee shall be responsible for: (a) day-to-day maintenance of the Premises; (b) minor repairs and upkeep; (c) payment of all utility charges (electricity, water, gas, internet, etc.); (d) maintaining the Premises in good and tenantable condition.
   5.3 The Lessee shall not make any structural alterations to the Premises without prior written consent of the Lessor.

6. USE OF PREMISES
   6.1 The Lessee shall use the Premises only for the permitted purpose stated in Clause 1.2.
   6.2 The Lessee shall not sub-let, assign, or part with possession of the Premises or any part thereof without the prior written consent of the Lessor.
   6.3 The Lessee shall comply with all laws, bye-laws, regulations, and rules applicable to the use and occupation of the Premises.

7. INSPECTION
   7.1 The Lessor shall have the right to inspect the Premises at any time during the Lease Term by giving at least twenty-four (24) hours' prior written notice, except in cases of emergency.

8. INSURANCE
   8.1 The Lessee shall, at its own cost, obtain and maintain adequate insurance for its contents, fixtures, fittings, and equipment kept at the Premises.
   8.2 The Lessor shall maintain insurance on the structure of the Premises.

9. VACATION AND HANDOVER
   9.1 Upon expiry or earlier termination of this Agreement, the Lessee shall vacate the Premises and deliver peaceful possession to the Lessor in the same condition as received (fair wear and tear excepted), together with all keys and access cards.
   9.2 The Lessee shall remove all its belongings from the Premises. Any property left behind after the vacation date may be disposed of by the Lessor.

10. TERMINATION
    10.1 Either Party may terminate this Agreement after the Lock-In Period by giving _________________________ days' written notice to the other Party.
    10.2 The Lessor may terminate this Agreement immediately if the Lessee: (a) fails to pay rent for more than thirty (30) days; (b) uses the Premises for any illegal or unauthorized purpose; (c) causes damage to the Premises; or (d) commits any other material breach.

11. STAMP DUTY AND REGISTRATION
    11.1 This Agreement shall be duly stamped and registered in accordance with the Registration Act, 1908, and the Indian Stamp Act, 1899 (or applicable state stamp law), the cost of which shall be borne by the Lessee / shared equally by both Parties, as agreed.

12. GOVERNING LAW AND DISPUTE RESOLUTION
    12.1 This Agreement shall be governed by and construed in accordance with the Laws of India, including the Transfer of Property Act, 1882.
    12.2 Any dispute arising out of or in connection with this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be _________________________, India.

IN WITNESS WHEREOF, the Parties have executed this Lease Agreement as of the date first written above.

LESSOR                                    LESSEE
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Date:      ____________________           Date:      ____________________

WITNESS 1                                 WITNESS 2
Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________`,

  CONSULTANCY: `CONSULTANCY AGREEMENT

This Consultancy Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], a company/entity having its principal place of business at _________________________ (hereinafter referred to as the "Client");

AND

[PARTY_2_NAME], an individual/entity having its principal place of business/residence at _________________________ (hereinafter referred to as the "Consultant").

WHEREAS, the Client desires to retain the services of the Consultant to provide certain consulting and advisory services;

WHEREAS, the Consultant has the expertise, skills, and experience necessary to provide such services;

WHEREAS, the Parties desire to enter into this Agreement setting forth the terms and conditions of the consultancy arrangement;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. SCOPE OF CONSULTANCY SERVICES
   1.1 The Consultant agrees to provide the following consulting and advisory services ("Services") to the Client:
       (a) _________________________
       (b) _________________________
       (c) _________________________
   1.2 The Consultant shall perform Services as an independent professional and shall not be subject to the supervisory authority of the Client with respect to the manner or means of performing the Services, except as to the results to be achieved.
   1.3 Additional services beyond the agreed scope shall be subject to a separate written agreement or amendment.

2. TERM
   2.1 This Agreement shall commence on the Effective Date and continue until _________________________ or upon completion of the Services, unless earlier terminated in accordance with the provisions of this Agreement.
   2.2 The Agreement may be renewed or extended by mutual written agreement.

3. CONSULTING FEES
   3.1 In consideration for the Services rendered, the Client shall pay the Consultant a consultancy fee of INR _________________________ (Indian Rupees _________________________) per month / per project / per hour, as agreed.
   3.2 The Consultant shall submit invoices on a _________________________ (monthly/bi-monthly/milestone) basis.
   3.3 The Client shall pay all undisputed invoices within twenty-one (21) days of receipt.
   3.4 Delayed payments shall attract interest at the rate of eighteen percent (18%) per annum.
   3.5 Expenses: The Client shall reimburse the Consultant for pre-approved out-of-pocket expenses (travel, accommodation, etc.) incurred in connection with the Services, upon submission of appropriate receipts.

4. TAXES
   4.1 The Consultant shall be solely responsible for the payment of all taxes, including income tax, GST (if applicable), and professional tax, on the consultancy fees received.
   4.2 The Client shall deduct Tax at Source (TDS) as applicable under the Income Tax Act, 1961, and shall issue TDS certificates (Form 16A) to the Consultant within the prescribed time.

5. INTELLECTUAL PROPERTY AND WORK PRODUCT
   5.1 All reports, analyses, deliverables, recommendations, documents, software, and other work product created by the Consultant in the course of performing Services under this Agreement ("Work Product") shall be the exclusive property of the Client.
   5.2 The Consultant hereby irrevocably assigns to the Client all rights, title, and interest in and to the Work Product, including all intellectual property rights therein, under the Copyright Act, 1957, the Patents Act, 1970, and other applicable Indian laws.
   5.3 The Consultant shall retain no rights in or to the Work Product except as expressly granted by the Client.
   5.4 Background IP: Each Party retains ownership of its pre-existing intellectual property. The Consultant grants the Client a non-exclusive, royalty-free licence to use the Consultant's background IP to the extent necessary to use the Work Product.

6. CONFIDENTIALITY
   6.1 The Consultant shall treat as strictly confidential all information relating to the Client's business, finances, clients, strategies, technology, operations, and affairs ("Confidential Information").
   6.2 The Consultant shall not disclose, use, copy, or reproduce any Confidential Information without the prior written consent of the Client, except as required by applicable law.
   6.3 Confidentiality obligations shall survive termination of this Agreement for a period of five (5) years.

7. NON-SOLICITATION
   7.1 During the term of this Agreement and for a period of twelve (12) months following its termination, the Consultant shall not, directly or indirectly:
       (a) Solicit, induce, or attempt to solicit or induce any employee, officer, or contractor of the Client to leave the Client's employment or engagement;
       (b) Solicit or approach any client, customer, or business partner of the Client with whom the Consultant had contact during the engagement, for the purpose of competing with the Client's business.

8. INDEPENDENT CONTRACTOR STATUS
   8.1 The Consultant is an independent contractor and not an employee, agent, or partner of the Client.
   8.2 The Consultant shall have no authority to bind the Client to any contract or obligation.
   8.3 The Consultant shall be responsible for providing its own tools, equipment, and resources.

9. REPRESENTATIONS AND WARRANTIES
   9.1 The Consultant represents and warrants that: (a) it has the necessary qualifications, expertise, and licences to perform the Services; (b) the Services shall be performed with due care and diligence; (c) the Work Product shall not infringe any third-party rights; (d) it is free to enter into this Agreement.

10. TERMINATION
    10.1 Either Party may terminate this Agreement by providing thirty (30) days' written notice.
    10.2 Either Party may terminate this Agreement immediately in the event of a material breach by the other Party that is not cured within fifteen (15) days of written notice.
    10.3 Upon termination, the Client shall pay for all Services performed and accepted up to the date of termination.

11. LIMITATION OF LIABILITY
    11.1 The Consultant's total aggregate liability under this Agreement shall not exceed the total fees paid in the three (3) months preceding the event giving rise to liability.
    11.2 Neither Party shall be liable for indirect, consequential, or punitive damages.

12. GOVERNING LAW AND DISPUTE RESOLUTION
    12.1 This Agreement shall be governed by and construed in accordance with the Laws of India.
    12.2 Any dispute arising out of or in connection with this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be _________________________, India, with proceedings in English before a sole arbitrator.

IN WITNESS WHEREOF, the Parties have executed this Consultancy Agreement as of the date first written above.

CLIENT                                    CONSULTANT
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Title:     ____________________           Date:      ____________________
Date:      ____________________`,

  FRANCHISE: `FRANCHISE AGREEMENT

This Franchise Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], a company incorporated under the Companies Act, 2013, having its registered office at _________________________ (hereinafter referred to as the "Franchisor");

AND

[PARTY_2_NAME], a company/individual having its principal place of business at _________________________ (hereinafter referred to as the "Franchisee").

WHEREAS, the Franchisor is the owner of a unique system for operating a _________________________ business and has developed certain proprietary marks, trade names, trade secrets, know-how, and operational methods in connection therewith ("Franchise System");

WHEREAS, the Franchisee desires to obtain the right to operate a franchise under the Franchise System and to use the Franchisor's trademarks and brand;

WHEREAS, the Franchisor is willing to grant such rights to the Franchisee on the terms and conditions set forth herein;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. GRANT OF FRANCHISE
   1.1 Subject to the terms and conditions of this Agreement, the Franchisor hereby grants to the Franchisee a limited, non-exclusive (unless specifically made exclusive herein), non-transferable right to operate one (1) franchise unit using the Franchise System and the Franchisor's brand/trademarks at the following location ("Franchise Location"):
       Address: _________________________
   1.2 The Franchisee shall operate the franchise solely from the Franchise Location and shall not relocate without prior written consent of the Franchisor.

2. TERRITORY EXCLUSIVITY
   2.1 The Franchisor grants the Franchisee an exclusive territory covering _________________________ (the "Exclusive Territory") during the term of this Agreement, provided the Franchisee is in compliance with all performance standards.
   2.2 The Franchisor shall not establish, or grant rights to any third party to establish, a competing franchise location within the Exclusive Territory during the term.
   2.3 Exclusivity may be revoked if the Franchisee fails to achieve agreed performance benchmarks for two (2) consecutive quarters.

3. TERM
   3.1 This Agreement shall commence on the Effective Date and continue for an initial term of _________________________ years ("Initial Term").
   3.2 The Franchisee shall have the option to renew this Agreement for _________________________ additional terms of _________________________ years each, subject to: (a) compliance with all terms of this Agreement; (b) execution of a renewal agreement; and (c) payment of a renewal fee of INR _________________________.

4. FRANCHISE FEE AND ROYALTIES
   4.1 Initial Franchise Fee: The Franchisee shall pay the Franchisor a one-time initial franchise fee of INR _________________________ (Indian Rupees _________________________) upon execution of this Agreement, which is non-refundable.
   4.2 Royalty Fee: The Franchisee shall pay the Franchisor an ongoing royalty fee of _____% of gross revenue per month, payable by the 15th of the following month.
   4.3 Marketing Contribution: The Franchisee shall contribute _____% of gross revenue to the Franchisor's national marketing fund.
   4.4 All fees are exclusive of applicable GST, which shall be borne by the Franchisee.

5. BRAND USAGE AND TRADEMARKS
   5.1 The Franchisor grants the Franchisee a limited licence to use the Franchisor's trademarks, trade names, logos, and other brand identifiers ("Marks") solely in connection with the operation of the franchised business during the term of this Agreement.
   5.2 The Franchisee shall use the Marks strictly in accordance with the Franchisor's brand guidelines and standards.
   5.3 The Franchisee shall not modify, alter, or create derivative works of any Mark without prior written consent.
   5.4 The Franchisee acknowledges the Franchisor's ownership of all Marks and shall not challenge such ownership.

6. TRAINING AND SUPPORT
   6.1 Initial Training: The Franchisor shall provide the Franchisee with initial training of _________________________ days at the Franchisor's training facility, at the Franchisee's cost (travel and accommodation).
   6.2 The Franchisor shall provide the Franchisee with access to the Operations Manual and other proprietary materials.
   6.3 Ongoing Support: The Franchisor shall provide the Franchisee with ongoing operational support, including field visits, updated training materials, and marketing support.

7. QUALITY STANDARDS
   7.1 The Franchisee shall operate the franchise in strict compliance with the Franchisor's quality standards, specifications, and operational procedures as set out in the Operations Manual.
   7.2 The Franchisee shall permit the Franchisor's representatives to inspect the Franchise Location and operations at any time upon reasonable notice.
   7.3 The Franchisee shall use only approved products, suppliers, and vendors.
   7.4 Failure to maintain quality standards shall constitute a material breach and grounds for termination.

8. REPORTING AND RECORDS
   8.1 The Franchisee shall maintain accurate books of account and records of all transactions.
   8.2 The Franchisee shall submit monthly financial reports and sales data to the Franchisor by the 10th of each following month.
   8.3 The Franchisor shall have the right to audit the Franchisee's records upon reasonable notice.

9. CONFIDENTIALITY
   9.1 The Franchisee shall keep strictly confidential the Operations Manual, the Franchise System, trade secrets, and all other Confidential Information of the Franchisor.
   9.2 Confidentiality obligations shall survive termination for a period of five (5) years.

10. NON-COMPETE
    10.1 During the term of this Agreement and for two (2) years following termination, the Franchisee shall not, directly or indirectly, operate, own, or be involved in any business that competes with the Franchisor's Franchise System within the Exclusive Territory or within _________________________ km of any other franchise location.

11. TERMINATION
    11.1 The Franchisor may terminate this Agreement with thirty (30) days' notice if the Franchisee: (a) fails to pay any fees when due; (b) fails to meet quality standards repeatedly; (c) makes unauthorized use of the Marks; or (d) commits any material breach.
    11.2 The Franchisor may terminate immediately upon insolvency, bankruptcy, or criminal conviction of the Franchisee.
    11.3 Upon termination, the Franchisee shall immediately cease using the Marks, the Franchise System, and all related materials, and return all proprietary materials to the Franchisor.

12. GOVERNING LAW AND DISPUTE RESOLUTION
    12.1 This Agreement shall be governed by and construed in accordance with the Laws of India.
    12.2 Any dispute arising out of or in connection with this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be _________________________, India.

IN WITNESS WHEREOF, the Parties have executed this Franchise Agreement as of the date first written above.

FRANCHISOR                                FRANCHISEE
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Title:     ____________________           Title:     ____________________
Date:      ____________________           Date:      ____________________`,

  MOU: `MEMORANDUM OF UNDERSTANDING

This Memorandum of Understanding ("MOU") is entered into as of [DATE] by and between:

[PARTY_1_NAME], having its principal place of business at _________________________ (hereinafter referred to as "Party 1");

AND

[PARTY_2_NAME], having its principal place of business at _________________________ (hereinafter referred to as "Party 2").

Party 1 and Party 2 are collectively referred to as the "Parties" and individually as a "Party."

WHEREAS, the Parties have had preliminary discussions regarding a potential collaboration for the purpose of _________________________;

WHEREAS, the Parties wish to record the terms of their understanding and the framework within which they propose to collaborate;

WHEREAS, both Parties recognize the mutual benefit of setting out their respective roles and responsibilities in this MOU;

NOW, THEREFORE, the Parties record their mutual understanding as follows:

1. PURPOSE AND BACKGROUND
   1.1 The purpose of this MOU is to establish a framework for cooperation and collaboration between the Parties in connection with _________________________ ("Collaboration").
   1.2 This MOU sets out the general principles, areas of collaboration, and mutual understandings of the Parties and is intended to guide the development of more detailed binding agreements.

2. NON-BINDING NATURE
   2.1 This MOU is a statement of intent and does not create any legally binding rights or obligations between the Parties, except as expressly stated in Clauses 6 (Confidentiality), 7 (Costs), and 9 (Governing Law), which are intended to be legally binding.
   2.2 No Party shall have any legal claim against the other for any failure to proceed with any transaction or arrangement contemplated in this MOU.
   2.3 Nothing in this MOU shall be construed as a commitment to enter into any definitive agreement.

3. AREAS OF COLLABORATION
   3.1 Subject to the negotiation and execution of definitive binding agreements, the Parties intend to collaborate in the following areas:
       (a) _________________________
       (b) _________________________
       (c) _________________________
   3.2 The specific terms, scope, structure, and financial arrangements of the Collaboration shall be set out in definitive agreements to be negotiated in good faith by the Parties.

4. GOOD FAITH AND COOPERATION
   4.1 The Parties agree to engage in good faith negotiations toward executing definitive agreements within a period of _________________________ months from the date of this MOU ("Negotiation Period").
   4.2 Each Party agrees to: (a) share relevant information reasonably required for the assessment and structuring of the Collaboration; (b) promptly respond to reasonable requests from the other Party; (c) not engage in negotiations with third parties for a substantially similar collaboration during the Negotiation Period without prior notice to the other Party.

5. NEXT STEPS AND TIMELINE
   5.1 The Parties agree to undertake the following next steps:
       (a) Exchange of relevant business and financial information by _________________________
       (b) Completion of due diligence (if applicable) by _________________________
       (c) Negotiation and execution of a definitive term sheet by _________________________
       (d) Execution of binding definitive agreements by _________________________
   5.2 Each Party shall appoint a representative to co-ordinate the above activities:
       Party 1 Representative: _________________________
       Party 2 Representative: _________________________

6. CONFIDENTIALITY
   6.1 Each Party undertakes to keep confidential and not disclose to any third party any information received from the other Party in the course of discussions relating to the Collaboration, except: (a) with the prior written consent of the other Party; (b) as required by applicable law or regulation; or (c) to its own advisors on a need-to-know basis subject to equivalent obligations.
   6.2 Confidentiality obligations shall apply for a period of two (2) years from the date of this MOU.
   6.3 This confidentiality clause is legally binding on both Parties.

7. COSTS
   7.1 Each Party shall bear its own costs and expenses incurred in connection with the preparation, negotiation, and execution of this MOU and any definitive agreements.
   7.2 Any shared costs of the Collaboration shall be agreed separately in writing.

8. TERM
   8.1 This MOU shall be effective from the date of execution and shall remain in effect until: (a) the execution of definitive binding agreements; (b) the expiry of the Negotiation Period without execution of definitive agreements; or (c) earlier termination by either Party upon thirty (30) days' written notice.

9. GOVERNING LAW
   9.1 This MOU and any dispute arising hereunder (insofar as it is legally binding) shall be governed by and construed in accordance with the Laws of India.
   9.2 Any legally binding dispute between the Parties arising from this MOU shall be subject to the exclusive jurisdiction of the courts at _________________________, India, or at the election of either Party, referred to arbitration under the Arbitration and Conciliation Act, 1996 (India).

10. GENERAL
    10.1 This MOU represents the complete understanding of the Parties with respect to the subject matter hereof and supersedes all prior discussions and understandings.
    10.2 This MOU may be amended only by a written document signed by both Parties.
    10.3 This MOU may be executed in counterparts, each of which shall be deemed an original.

IN WITNESS WHEREOF, the Parties have signed this Memorandum of Understanding as of the date first written above.

PARTY 1                                   PARTY 2
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Title:     ____________________           Title:     ____________________
Date:      ____________________           Date:      ____________________`,

  CUSTOM: `GENERAL CONTRACT AGREEMENT

This Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

[PARTY_1_NAME], having its principal place of business/residence at _________________________ (hereinafter referred to as "Party 1");

AND

[PARTY_2_NAME], having its principal place of business/residence at _________________________ (hereinafter referred to as "Party 2").

Party 1 and Party 2 are collectively referred to as the "Parties" and individually as a "Party."

WHEREAS, the Parties desire to enter into an agreement for the purpose of _________________________;

WHEREAS, the Parties wish to set forth their respective rights, duties, and obligations in relation to the same;

WHEREAS, this Agreement is made in accordance with the provisions of the Indian Contract Act, 1872, and other applicable laws of India;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. PURPOSE AND SCOPE
   1.1 The purpose of this Agreement is to govern the arrangement between the Parties with respect to _________________________.
   1.2 The specific scope of obligations, deliverables, and services (if any) shall be as mutually agreed in writing and may be set out in schedules or annexures attached to this Agreement.

2. TERM
   2.1 This Agreement shall commence on the Effective Date and shall continue until _________________________ unless earlier terminated in accordance with the provisions of this Agreement.
   2.2 The Agreement may be renewed or extended by mutual written agreement of the Parties.

3. OBLIGATIONS OF THE PARTIES
   3.1 Party 1 agrees to: (a) _________________________; (b) _________________________; (c) _________________________.
   3.2 Party 2 agrees to: (a) _________________________; (b) _________________________; (c) _________________________.
   3.3 Each Party shall perform its obligations in a timely, professional, and diligent manner.

4. CONSIDERATION AND PAYMENT
   4.1 In consideration for the obligations undertaken by Party 2, Party 1 shall pay an amount of INR _________________________ (Indian Rupees _________________________) in accordance with the payment schedule set out below:
       (a) ___% upon execution of this Agreement;
       (b) ___% upon completion of _________________________; and
       (c) ___% upon final delivery/completion.
   4.2 Payments shall be made by bank transfer to the bank account designated by Party 2 in writing.
   4.3 In the event of delay in payment, interest shall accrue on the outstanding amount at the rate of eighteen percent (18%) per annum from the due date until the date of actual payment.

5. REPRESENTATIONS AND WARRANTIES
   5.1 Each Party represents and warrants that: (a) it has full legal capacity, power, and authority to enter into this Agreement; (b) this Agreement constitutes a valid, binding, and enforceable obligation; (c) the execution and performance of this Agreement does not violate any law or third-party agreement to which it is a party; and (d) there are no pending legal proceedings that would adversely affect its ability to perform.

6. CONFIDENTIALITY
   6.1 Each Party agrees to maintain the confidentiality of the other Party's Confidential Information using reasonable care.
   6.2 "Confidential Information" means any non-public information disclosed by one Party to the other that is designated as confidential or that reasonably should be understood to be confidential.
   6.3 Confidentiality obligations shall survive termination for a period of three (3) years.

7. INDEMNIFICATION
   7.1 Each Party ("Indemnifying Party") shall indemnify, defend, and hold harmless the other Party ("Indemnified Party") and its officers, directors, employees, and agents from and against any and all claims, liabilities, losses, damages, costs, and expenses (including reasonable legal fees) arising out of or resulting from: (a) any breach of this Agreement by the Indemnifying Party; (b) the negligence or willful misconduct of the Indemnifying Party; or (c) violation of any applicable law by the Indemnifying Party.

8. LIMITATION OF LIABILITY
   8.1 Neither Party shall be liable to the other for any indirect, incidental, special, consequential, or punitive damages.
   8.2 Each Party's total aggregate liability under this Agreement shall not exceed the total consideration paid or payable under this Agreement.

9. FORCE MAJEURE
   9.1 Neither Party shall be in breach of this Agreement or liable for any delay or failure to perform its obligations if such delay or failure results from a Force Majeure Event.
   9.2 "Force Majeure Event" means any event beyond the reasonable control of a Party, including acts of God, natural disasters, war, terrorism, strikes, government actions, pandemics, or failure of utility services.
   9.3 The affected Party shall notify the other Party in writing within five (5) business days of the occurrence of a Force Majeure Event.

10. TERMINATION
    10.1 Either Party may terminate this Agreement for convenience by providing thirty (30) days' written notice.
    10.2 Either Party may terminate this Agreement immediately upon written notice if the other Party: (a) commits a material breach that remains uncured for fifteen (15) days after written notice; (b) becomes insolvent or files for bankruptcy; or (c) engages in fraudulent conduct.
    10.3 Upon termination, each Party shall promptly return or destroy the other Party's Confidential Information and property.

11. DISPUTE RESOLUTION
    11.1 The Parties shall first attempt to resolve any dispute by mutual negotiation within thirty (30) days of written notice of the dispute.
    11.2 If the dispute remains unresolved, it shall be referred to mediation under the Mediation Act, 2023 (India) as a preliminary step.
    11.3 If mediation is unsuccessful, the dispute shall be finally resolved by arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be _________________________, India. The arbitral tribunal shall consist of a sole arbitrator agreed upon by the Parties.

12. GOVERNING LAW
    12.1 This Agreement shall be governed by and construed in accordance with the Laws of India, including the Indian Contract Act, 1872.

13. GENERAL PROVISIONS
    13.1 Entire Agreement: This Agreement constitutes the entire agreement between the Parties with respect to the subject matter and supersedes all prior agreements, understandings, and negotiations.
    13.2 Amendments: No amendment to this Agreement shall be valid unless made in writing and signed by authorized representatives of both Parties.
    13.3 Waiver: Failure to exercise any right shall not constitute a waiver of such right.
    13.4 Severability: If any provision is held invalid or unenforceable, the remaining provisions shall continue in full force.
    13.5 Assignment: Neither Party may assign its rights or obligations without the prior written consent of the other Party.
    13.6 Notices: All notices shall be in writing and delivered by registered post, courier, or email (with confirmation of receipt) to the addresses set out in this Agreement.
    13.7 Counterparts: This Agreement may be executed in counterparts, each of which shall be deemed an original.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date first written above.

PARTY 1                                   PARTY 2
[PARTY_1_NAME]                            [PARTY_2_NAME]

Signature: ____________________           Signature: ____________________
Name:      ____________________           Name:      ____________________
Title:     ____________________           Title:     ____________________
Date:      ____________________           Date:      ____________________`,
}

// ─── Type Config ─────────────────────────────────────────────────────────────

interface TypeConfigEntry {
  label: string
  description: string
  icon: string
}

const TYPE_CONFIG: Record<AgreementType, TypeConfigEntry> = {
  NDA: {
    label: 'Non-Disclosure Agreement',
    description: 'Protect confidential information shared between parties',
    icon: '🔒',
  },
  EMPLOYMENT: {
    label: 'Employment Contract',
    description: 'Hire employees with clearly defined terms and benefits',
    icon: '👔',
  },
  VENDOR: {
    label: 'Vendor Agreement',
    description: 'Govern procurement relationships with suppliers',
    icon: '📦',
  },
  SERVICE: {
    label: 'Service Agreement',
    description: 'Define deliverables and SLAs for professional services',
    icon: '🛠️',
  },
  PARTNERSHIP: {
    label: 'Partnership Deed',
    description: 'Form a legal partnership with profit-sharing terms',
    icon: '🤝',
  },
  LEASE: {
    label: 'Lease Agreement',
    description: 'Lease commercial or residential property under Indian law',
    icon: '🏢',
  },
  CONSULTANCY: {
    label: 'Consultancy Agreement',
    description: 'Engage independent consultants with defined deliverables',
    icon: '💼',
  },
  FRANCHISE: {
    label: 'Franchise Agreement',
    description: 'Grant franchise rights with territory and royalty terms',
    icon: '🏪',
  },
  MOU: {
    label: 'Memorandum of Understanding',
    description: 'Record intent to collaborate without binding commitment',
    icon: '📋',
  },
  CUSTOM: {
    label: 'Custom Agreement',
    description: 'A flexible general-purpose contract template',
    icon: '📝',
  },
}

const STATUS_CONFIG: Record<AgreementStatus, { label: string }> = {
  DRAFT: { label: 'Draft' },
  PENDING_SIGNATURE: { label: 'Pending Signature' },
  PARTIALLY_SIGNED: { label: 'Partially Signed' },
  FULLY_SIGNED: { label: 'Fully Signed' },
  DECLINED: { label: 'Declined' },
  EXPIRED: { label: 'Expired' },
  CANCELLED: { label: 'Cancelled' },
}

const STATUS_TONE: Record<AgreementStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  PENDING_SIGNATURE: 'info',
  PARTIALLY_SIGNED: 'warning',
  FULLY_SIGNED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'warning',
  CANCELLED: 'danger',
}

const ALL_AGREEMENT_TYPES = Object.keys(TYPE_CONFIG) as AgreementType[]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormData {
  title: string
  parties: Party[]
  expiresAt: string
  jurisdiction: string
  governingLaw: string
  notes: string
  content: string
}

const DEFAULT_PARTY: Party = { name: '', email: '', role: '' }

const DEFAULT_FORM_DATA: FormData = {
  title: '',
  parties: [
    { name: '', email: '', role: 'Party 1' },
    { name: '', email: '', role: 'Party 2' },
  ],
  expiresAt: '',
  jurisdiction: '',
  governingLaw: 'Laws of India',
  notes: '',
  content: '',
}

// ─── Signing Modal ────────────────────────────────────────────────────────────

type SigningModalStep = 'otp' | 'sign'

interface SigningModalProps {
  partyName: string
  partyEmail: string
  agreementId: string
  onClose: () => void
  onSigned: () => void
}

function SigningModal({ partyName, partyEmail, agreementId, onClose, onSigned }: SigningModalProps) {
  const [modalStep, setModalStep] = useState<SigningModalStep>('otp')
  const [otp, setOtp] = useState<string>('')
  const [otpSent, setOtpSent] = useState<boolean>(false)
  const [otpLoading, setOtpLoading] = useState<boolean>(false)
  const [otpError, setOtpError] = useState<string>('')
  const [signatureConsent, setSignatureConsent] = useState<boolean>(false)
  const [signError, setSignError] = useState<string>('')
  const [signing, setSigning] = useState<boolean>(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState<boolean>(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  async function sendOtp() {
    setOtpLoading(true)
    setOtpError('')
    try {
      const res = await fetch(`/api/agreements/${agreementId}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyEmail }),
      })
      const data = await res.json()
      if (res.ok) {
        setOtpSent(true)
        if (!data.sent) setOtpError(data.message || 'OTP generated but the email failed to send.')
      } else {
        setOtpError(data.error || 'Failed to send OTP')
      }
    } catch {
      setOtpError('Failed to send OTP')
    } finally {
      setOtpLoading(false)
    }
  }

  function verifyOtp() {
    if (!otp || otp.length !== 6) {
      setOtpError('Please enter a 6-digit OTP')
      return
    }
    // Actual verification happens at sign time on the server.
    setModalStep('sign')
  }

  function getCanvasPos(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    setIsDrawing(true)
    lastPos.current = getCanvasPos(e)
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!isDrawing) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    const pos = getCanvasPos(e)
    if (!pos || !lastPos.current) return
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#4338ca'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPos.current = pos
  }

  function stopDrawing() {
    setIsDrawing(false)
    lastPos.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function isCanvasEmpty(): boolean {
    const canvas = canvasRef.current
    if (!canvas) return true
    const ctx = canvas.getContext('2d')
    if (!ctx) return true
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    return !data.some((v: number) => v !== 0)
  }

  async function submitSignature() {
    if (!signatureConsent) {
      setSignError('Please consent to the electronic signature terms')
      return
    }
    if (isCanvasEmpty()) {
      setSignError('Please draw your signature')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const signatureData = canvas.toDataURL('image/png')

    setSigning(true)
    setSignError('')
    try {
      const res = await fetch(`/api/agreements/${agreementId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyEmail, otp, signatureData }),
      })
      const data = await res.json()
      if (res.ok) {
        onSigned()
      } else {
        setSignError(data.error || 'Failed to submit signature')
      }
    } catch {
      setSignError('Failed to submit signature')
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md shadow-card-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="h-section">Sign Agreement</h3>
            <p className="text-ink-3 text-xs">{partyName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink w-8 h-8 flex items-center justify-center rounded-control hover:bg-surface-2 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex px-6 pt-4 gap-2">
          <div className={`flex-1 h-1 rounded-full ${modalStep === 'otp' || modalStep === 'sign' ? 'bg-accent' : 'bg-surface-3'}`} />
          <div className={`flex-1 h-1 rounded-full ${modalStep === 'sign' ? 'bg-accent' : 'bg-surface-3'}`} />
        </div>

        <div className="px-6 py-5">
          {modalStep === 'otp' && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <p className="text-ink font-medium text-sm">OTP Verification</p>
                <p className="text-ink-3 text-xs mt-1">
                  {otpSent
                    ? `Enter the OTP sent to ${partyEmail}`
                    : `We will send an OTP to ${partyEmail}`}
                </p>
              </div>

              {otpSent && (
                <Field label="Enter 6-digit OTP">
                  <Input
                    type="text"
                    value={otp}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="text-center text-2xl font-mono tracking-widest"
                  />
                </Field>
              )}

              {otpError && <p className="text-danger text-sm text-center">{otpError}</p>}

              <div className="flex gap-2">
                {!otpSent ? (
                  <Button onClick={sendOtp} disabled={otpLoading} loading={otpLoading} className="flex-1">
                    {otpLoading ? 'Sending...' : 'Send OTP'}
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={sendOtp} disabled={otpLoading}>
                      {otpLoading ? '...' : 'Resend'}
                    </Button>
                    <Button onClick={verifyOtp} disabled={otpLoading || otp.length !== 6} className="flex-1">
                      Verify OTP
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {modalStep === 'sign' && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-ink font-medium text-sm">Draw Your Signature</p>
                <p className="text-ink-3 text-xs mt-1">Use your mouse or finger to sign below</p>
              </div>

              <div className="relative bg-surface-2 border border-border rounded-control overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={420}
                  height={160}
                  className="w-full cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <button
                  onClick={clearCanvas}
                  className="absolute top-2 right-2 px-2 py-1 text-xs bg-surface hover:bg-surface-2 text-ink-3 rounded-control border border-border transition-colors"
                >
                  Clear
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/2 border-b border-border-strong pointer-events-none" />
              </div>

              <div
                className="flex items-start gap-3 p-3 bg-surface-2 border border-border rounded-control cursor-pointer"
                onClick={() => setSignatureConsent(!signatureConsent)}
              >
                <div
                  className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                    signatureConsent ? 'bg-accent border-accent' : 'border-border-strong'
                  }`}
                >
                  {signatureConsent && <span className="text-white text-xs">✓</span>}
                </div>
                <p className="text-ink-3 text-xs leading-relaxed">
                  I agree that this electronic signature is legally binding under the{' '}
                  <span className="text-accent">Information Technology Act, 2000</span>, and the{' '}
                  <span className="text-accent">Indian Contract Act, 1872</span>. I confirm that I am
                  authorised to sign this agreement.
                </p>
              </div>

              {signError && <p className="text-danger text-sm text-center">{signError}</p>}

              <Button
                variant="success"
                onClick={submitSignature}
                disabled={signing || !signatureConsent}
                loading={signing}
                className="w-full"
              >
                {signing ? 'Submitting...' : 'Submit Signature'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgreementsPage() {
  const [activeTab, setActiveTab] = useState<'ALL' | AgreementStatus>('ALL')
  const [showNewForm, setShowNewForm] = useState<boolean>(false)

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedType, setSelectedType] = useState<AgreementType | null>(null)
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA)
  const [saving, setSaving] = useState<boolean>(false)

  // Detail view / send / sign state
  const [detailAgreement, setDetailAgreement] = useState<Agreement | null>(null)
  const [detailLoading, setDetailLoading] = useState<boolean>(false)
  const [actionLoading, setActionLoading] = useState<boolean>(false)
  const [sendResult, setSendResult] = useState<Array<{ partyEmail: string; emailSent: boolean; signingLink: string }> | null>(null)
  const [signingParty, setSigningParty] = useState<{ name: string; email: string } | null>(null)

  // Fetch business ID on mount
  // NOTE: the real shape nests these under data.user / data.businesses
  // — {businessId, isSuperAdmin} do NOT exist at the response root.
  // (Same bug fixed elsewhere: admin/modules, admin/document-numbers,
  // admin/integrations.)
  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string = meData?.user?.activeBusinessId ?? meData?.businesses?.[0]?._id ?? ''
  // Only a super admin may override a party's recipient email at the
  // moment an agreement is sent (see handleSendForSigning below) — this
  // mirrors the same guard enforced server-side in
  // /api/agreements/[id]/send.
  const isSuperAdmin = !!meData?.user?.isSuperAdmin

  // Fetch agreements when businessId is set
  const {
    data: agreementsRaw,
    isLoading: loading,
    error: agreementsSwrError,
    mutate: fetchAgreements,
  } = useSWR(businessId ? `/api/agreements?businessId=${businessId}` : null, { keepPreviousData: true })
  const agreements: Agreement[] = Array.isArray(agreementsRaw) ? agreementsRaw : (agreementsRaw?.agreements ?? [])
  const error: string = agreementsSwrError ? (agreementsSwrError instanceof Error ? agreementsSwrError.message : 'Something went wrong') : ''

  // Optimistic single-agreement patch, mirroring the old setAgreements(prev => prev.map(...))
  // updates but against the SWR cache instead of local state.
  function patchAgreement(id: string, patch: Partial<Agreement>) {
    fetchAgreements((prev: any) => {
      const list: Agreement[] = Array.isArray(prev) ? prev : (prev?.agreements ?? [])
      const nextList = list.map((a: Agreement) => (a._id === id ? { ...a, ...patch } : a))
      return Array.isArray(prev) ? nextList : { ...prev, agreements: nextList }
    }, false)
  }

  // Filtered agreements
  const filteredAgreements =
    activeTab === 'ALL' ? agreements : agreements.filter((a: Agreement) => a.status === activeTab)

  // Stats
  const stats = {
    total: agreements.length,
    draft: agreements.filter((a: Agreement) => a.status === 'DRAFT').length,
    sent: agreements.filter((a: Agreement) =>
      ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'].includes(a.status)
    ).length,
    signed: agreements.filter((a: Agreement) => a.status === 'FULLY_SIGNED').length,
  }

  // ── Wizard helpers ──

  function openNewForm() {
    setStep(1)
    setSelectedType(null)
    setFormData(DEFAULT_FORM_DATA)
    setShowNewForm(true)
  }

  function closeForm() {
    setShowNewForm(false)
  }

  function handleSelectType(type: AgreementType) {
    setSelectedType(type)
    setFormData((prev: FormData) => ({ ...prev, content: AGREEMENT_TEMPLATES[type] }))
    setStep(2)
  }

  function handleFormChange(field: keyof FormData, value: string) {
    setFormData((prev: FormData) => ({ ...prev, [field]: value }))
  }

  function handlePartyChange(index: number, field: keyof Party, value: string) {
    setFormData((prev: FormData) => {
      const parties = [...prev.parties]
      parties[index] = { ...parties[index], [field]: value }
      return { ...prev, parties }
    })
  }

  function addParty() {
    setFormData((prev: FormData) => ({
      ...prev,
      parties: [...prev.parties, { ...DEFAULT_PARTY }],
    }))
  }

  function removeParty(index: number) {
    setFormData((prev: FormData) => ({
      ...prev,
      parties: prev.parties.filter((_: Party, i: number) => i !== index),
    }))
  }

  function goNext() {
    setStep((prev: 1 | 2 | 3 | 4) => Math.min(prev + 1, 4) as 1 | 2 | 3 | 4)
  }

  function goBack() {
    setStep((prev: 1 | 2 | 3 | 4) => Math.max(prev - 1, 1) as 1 | 2 | 3 | 4)
  }

  async function handleSaveDraft() {
    if (!selectedType) return
    setSaving(true)
    try {
      const payload = {
        businessId,
        title:
          formData.title ||
          `${TYPE_CONFIG[selectedType as AgreementType].label} — ${new Date().toLocaleDateString('en-IN')}`,
        type: selectedType,
        status: 'DRAFT',
        parties: formData.parties.filter((p: Party) => p.name.trim()),
        content: formData.content,
        governingLaw: formData.governingLaw,
        jurisdiction: formData.jurisdiction,
        expiresAt: formData.expiresAt || null,
        notes: formData.notes,
      }
      const res = await fetch('/api/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save agreement')
      const created: Agreement = await res.json()
      fetchAgreements((prev: any) => {
        const list: Agreement[] = Array.isArray(prev) ? prev : (prev?.agreements ?? [])
        const nextList = [created, ...list]
        return Array.isArray(prev) ? nextList : { ...prev, agreements: nextList }
      }, false)
      closeForm()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Detail view / Send / Sign helpers ──

  async function openDetail(agreementId: string) {
    setDetailLoading(true)
    setSendResult(null)
    try {
      const res = await fetch(`/api/agreements/${agreementId}`)
      const data = await res.json()
      if (res.ok) {
        setDetailAgreement(data.agreement)
      } else {
        alert(data.error || 'Failed to load agreement')
      }
    } catch {
      alert('Failed to load agreement')
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setDetailAgreement(null)
    setSendResult(null)
  }

  async function refreshDetail(agreementId: string) {
    try {
      const res = await fetch(`/api/agreements/${agreementId}`)
      const data = await res.json()
      if (res.ok) setDetailAgreement(data.agreement)
    } catch {
      // ignore — non-critical refresh
    }
  }

  async function handleSendForSigning(agreementId: string, parties?: Party[]) {
    if (!confirm('Send this agreement to all parties for signing?')) return

    // Give a super admin one last chance to fix a wrong/missing recipient
    // email right before it goes out — previously the only place to edit
    // a party's email was the DRAFT edit form, which is easy to miss and
    // doesn't apply once the agreement already exists. Regular admins
    // don't see this prompt (server also enforces the same restriction).
    const emailOverrides: Record<string, string> = {}
    if (isSuperAdmin && parties && parties.length > 0) {
      for (const party of parties) {
        const current = party.email || ''
        const input = window.prompt(
          `Recipient email for ${party.name || party.role} (${party.role}) — leave unchanged to keep as-is:`,
          current
        )
        if (input !== null && input.trim() && input.trim() !== current) {
          emailOverrides[party.role] = input.trim()
        }
      }
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.keys(emailOverrides).length > 0 ? { emailOverrides } : {}),
      })
      const data = await res.json()
      if (res.ok) {
        setSendResult(data.signingLinks)
        patchAgreement(agreementId, { status: 'PENDING_SIGNATURE' as AgreementStatus })
        await refreshDetail(agreementId)
      } else {
        alert(data.error || 'Failed to send agreement')
      }
    } catch {
      alert('Failed to send agreement')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancelAgreement(agreementId: string) {
    if (!confirm('Are you sure you want to cancel this agreement?')) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/agreements/${agreementId}`, { method: 'DELETE' })
      if (res.ok) {
        patchAgreement(agreementId, { status: 'CANCELLED' as AgreementStatus })
        await refreshDetail(agreementId)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to cancel agreement')
      }
    } catch {
      alert('Failed to cancel agreement')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Sub-components ──

  const typeConfig = selectedType ? TYPE_CONFIG[selectedType as AgreementType] : null

  function StepIndicator() {
    const steps = ['Choose Type', 'Details', 'Review Content', 'Preview']
    return (
      <div className="flex items-center gap-2 px-6 py-4 border-b border-border bg-bg">
        {steps.map((label, i) => {
          const n = i + 1
          const isActive = n === step
          const isDone = n < step
          return (
            <React.Fragment key={label}>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isActive
                      ? 'bg-accent text-white'
                      : isDone
                        ? 'bg-success text-white'
                        : 'bg-surface-3 text-ink-3'
                  }`}
                >
                  {isDone ? '✓' : n}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:block ${
                    isActive
                      ? 'text-accent'
                      : isDone
                        ? 'text-success'
                        : 'text-ink-3'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px ${isDone ? 'bg-success' : 'bg-surface-3'}`} />
              )}
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <PageHeader
        title="Agreements"
        description="Create and manage all your business agreements in one place"
        actions={<Button onClick={openNewForm} icon={<span className="text-lg leading-none">+</span>}>New Agreement</Button>}
      />

      <div className="px-6 py-6 space-y-6">
        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'text-ink' },
            { label: 'Draft', value: stats.draft, color: 'text-ink-2' },
            { label: 'Sent', value: stats.sent, color: 'text-info' },
            { label: 'Signed', value: stats.signed, color: 'text-success' },
          ].map(({ label, value, color }) => (
            <Card key={label} className="px-5 py-4">
              <p className="text-xs font-medium text-ink-3 uppercase tracking-wider">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            </Card>
          ))}
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex gap-1 bg-surface-2 p-1 rounded-control w-fit">
          {(['ALL', 'DRAFT', 'PENDING_SIGNATURE', 'PARTIALLY_SIGNED', 'FULLY_SIGNED', 'EXPIRED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-control text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {tab === 'ALL' ? 'All' : STATUS_CONFIG[tab].label}
            </button>
          ))}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="bg-danger-soft border border-danger/30 rounded-control px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* ── Loading ── */}
        {loading ? (
          <LoadingPanel label="Loading agreements…" />
        ) : filteredAgreements.length === 0 ? (
          /* ── Empty State ── */
          <EmptyState
            kind="empty"
            title="No agreements yet"
            description={
              activeTab === 'ALL'
                ? 'Create your first agreement to get started.'
                : `No agreements with status "${activeTab.toLowerCase()}" found.`
            }
            action={
              activeTab === 'ALL' ? (
                <Button onClick={openNewForm}>Create Agreement</Button>
              ) : undefined
            }
          />
        ) : (
          /* ── Agreement Cards Grid ── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgreements.map((agreement: Agreement) => {
              const tc = TYPE_CONFIG[agreement.type]
              const sc = STATUS_CONFIG[agreement.status]
              return (
                <div
                  key={agreement._id}
                  className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4 hover:shadow-card-lg transition-shadow"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-control bg-surface-2 flex items-center justify-center text-xl flex-shrink-0">
                        {tc.icon}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2">
                          {agreement.title}
                        </h3>
                        <span className="text-xs text-ink-3 mt-0.5 block">{tc.label}</span>
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[agreement.status]}>
                      {sc.label}
                    </Badge>
                  </div>

                  {/* Parties */}
                  {agreement.parties.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-ink-3 uppercase tracking-wider">
                        Parties
                      </p>
                      {agreement.parties.slice(0, 3).map((party: Party, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-accent-soft flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">
                            {(party.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-ink-2 truncate">
                            {party.name || party.email}
                          </span>
                          {party.role && (
                            <span className="text-xs text-ink-3 truncate">· {party.role}</span>
                          )}
                        </div>
                      ))}
                      {agreement.parties.length > 3 && (
                        <p className="text-xs text-ink-3">
                          +{agreement.parties.length - 3} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Card Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
                    <span className="text-xs text-ink-3">{formatDate(agreement.createdAt)}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(agreement._id)}>
                        View
                      </Button>
                      {agreement.status === 'DRAFT' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSendForSigning(agreement._id, agreement.parties)}
                          disabled={actionLoading}
                        >
                          Send
                        </Button>
                      )}
                      {(agreement.status === 'PENDING_SIGNATURE' || agreement.status === 'PARTIALLY_SIGNED') && (
                        <Button variant="ghost" size="sm" onClick={() => openDetail(agreement._id)}>
                          Sign
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Slide-over Panel ── */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={closeForm} />

          {/* Panel */}
          <div className="relative w-full md:w-2/3 lg:w-1/2 max-h-[90vh] bg-surface rounded-card border border-border flex flex-col shadow-card-lg overflow-hidden">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="h-section">New Agreement</h2>
              <button
                onClick={closeForm}
                className="text-ink-3 hover:text-ink-2 w-8 h-8 flex items-center justify-center rounded-control hover:bg-surface-2 transition-colors"
              >
                ✕
              </button>
            </div>

            <StepIndicator />

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto">
              {/* ── Step 1: Select Type ── */}
              {step === 1 && (
                <div className="p-6">
                  <p className="text-sm text-ink-2 mb-4">
                    Select the type of agreement you want to create.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ALL_AGREEMENT_TYPES.map((type) => {
                      const cfg = TYPE_CONFIG[type]
                      return (
                        <button
                          key={type}
                          onClick={() => handleSelectType(type)}
                          className="flex items-start gap-3 p-4 rounded-card border-2 border-border bg-surface-2 hover:border-accent/40 hover:shadow-card transition-all text-left group"
                        >
                          <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-ink group-hover:text-accent">
                              {cfg.label}
                            </p>
                            <p className="text-xs text-ink-3 mt-0.5 leading-relaxed">
                              {cfg.description}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Step 2: Form Fields ── */}
              {step === 2 && selectedType && typeConfig && (
                <div className="p-6 space-y-6">
                  {/* Selected type badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded-control bg-surface-2">
                    <span className="text-lg">{typeConfig.icon}</span>
                    <span className="text-sm font-semibold text-ink">{typeConfig.label}</span>
                    <button
                      onClick={() => setStep(1)}
                      className="ml-2 text-ink-3 hover:text-ink-2 text-xs underline"
                    >
                      Change
                    </button>
                  </div>

                  {/* Title */}
                  <Field label="Agreement Title" required>
                    <Input
                      type="text"
                      value={formData.title}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFormChange('title', e.target.value)}
                      placeholder={`e.g. NDA with Acme Corp — 2025`}
                    />
                  </Field>

                  {/* Parties */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-ink-2">Parties</label>
                      <button
                        onClick={addParty}
                        className="text-xs text-accent hover:text-accent font-medium flex items-center gap-1"
                      >
                        + Add Party
                      </button>
                    </div>
                    <div className="space-y-3">
                      {formData.parties.map((party: Party, index: number) => (
                        <div
                          key={index}
                          className="p-3 border border-border rounded-control bg-bg space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-ink-3">
                              Party {index + 1}
                            </span>
                            {formData.parties.length > 2 && (
                              <button
                                onClick={() => removeParty(index)}
                                className="text-xs text-danger hover:text-danger"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Input
                              type="text"
                              value={party.name}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePartyChange(index, 'name', e.target.value)}
                              placeholder="Full name"
                            />
                            <Input
                              type="email"
                              value={party.email}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePartyChange(index, 'email', e.target.value)}
                              placeholder="Email address"
                            />
                            <Input
                              type="text"
                              value={party.role}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePartyChange(index, 'role', e.target.value)}
                              placeholder={`Role (e.g. Party ${index + 1})`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Expiry Date */}
                  <Field label="Expiry Date (optional)">
                    <Input
                      type="date"
                      value={formData.expiresAt}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFormChange('expiresAt', e.target.value)}
                    />
                  </Field>

                  {/* Jurisdiction */}
                  <Field label="Jurisdiction">
                    <Input
                      type="text"
                      value={formData.jurisdiction}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFormChange('jurisdiction', e.target.value)}
                      placeholder="e.g. Mumbai, Maharashtra"
                    />
                  </Field>

                  {/* Governing Law */}
                  <Field label="Governing Law">
                    <Input
                      type="text"
                      value={formData.governingLaw}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFormChange('governingLaw', e.target.value)}
                      placeholder="Laws of India"
                    />
                  </Field>

                  {/* Notes */}
                  <Field label="Internal Notes (optional)">
                    <Textarea
                      value={formData.notes}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFormChange('notes', e.target.value)}
                      placeholder="Add any internal notes or context about this agreement..."
                      rows={3}
                    />
                  </Field>
                </div>
              )}

              {/* ── Step 3: Review Content ── */}
              {step === 3 && selectedType && (
                <div className="p-6">
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-ink mb-1">
                      Review and Customize Agreement Content
                    </label>
                    <p className="text-xs text-ink-3">
                      The template has been pre-populated based on your selected agreement type.
                      Edit the content directly to customize it.
                    </p>
                  </div>
                  <Textarea
                    value={formData.content}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFormChange('content', e.target.value)}
                    className="font-mono leading-relaxed resize-y"
                    style={{ minHeight: '24rem' }}
                  />
                </div>
              )}

              {/* ── Step 4: Preview ── */}
              {step === 4 && selectedType && typeConfig && (
                <div className="p-6">
                  <p className="text-xs text-ink-3 mb-4">
                    Review your agreement below before saving. Click "Save as Draft" when ready.
                  </p>

                  {/* Legal Document Preview */}
                  <div className="bg-surface border border-border-strong rounded-card p-8 shadow-inner">
                    {/* Document Title */}
                    <div className="text-center mb-8 pb-6 border-b border-border">
                      <div className="text-3xl mb-2">{typeConfig.icon}</div>
                      <h2 className="text-xl font-bold text-ink tracking-wide uppercase">
                        {formData.title || typeConfig.label}
                      </h2>
                      <p className="text-sm text-ink-3 mt-1 font-medium">{typeConfig.label}</p>
                    </div>

                    {/* Agreement Meta */}
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                      <div>
                        <span className="font-semibold text-ink-2">Governing Law:</span>{' '}
                        <span className="text-ink-2">
                          {formData.governingLaw || 'Laws of India'}
                        </span>
                      </div>
                      {formData.jurisdiction && (
                        <div>
                          <span className="font-semibold text-ink-2">Jurisdiction:</span>{' '}
                          <span className="text-ink-2">{formData.jurisdiction}</span>
                        </div>
                      )}
                      {formData.expiresAt && (
                        <div>
                          <span className="font-semibold text-ink-2">Expires:</span>{' '}
                          <span className="text-ink-2">{formatDate(formData.expiresAt)}</span>
                        </div>
                      )}
                    </div>

                    {/* Parties */}
                    {formData.parties.filter((p: Party) => p.name || p.email).length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider mb-3">
                          Parties to this Agreement
                        </h3>
                        <div className="space-y-2">
                          {formData.parties
                            .filter((p: Party) => p.name || p.email)
                            .map((party: Party, i: number) => (
                              <div
                                key={i}
                                className="flex items-start gap-3 p-3 bg-bg rounded-control"
                              >
                                <div className="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                                  {(party.name || party.email || '?').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-ink">
                                    {party.name || '(unnamed)'}
                                  </p>
                                  <p className="text-xs text-ink-3">
                                    {party.role && <span className="mr-2">{party.role}</span>}
                                    {party.email && <span>{party.email}</span>}
                                  </p>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Content Preview */}
                    <div>
                      <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider mb-3">
                        Agreement Content
                      </h3>
                      <div className="bg-bg rounded-control p-4 max-h-96 overflow-y-auto">
                        <pre className="text-xs text-ink-2 whitespace-pre-wrap font-mono leading-relaxed">
                          {formData.content}
                        </pre>
                      </div>
                    </div>

                    {/* Internal Notes */}
                    {formData.notes && (
                      <div className="mt-4 p-3 bg-warning-soft border border-warning/20 rounded-control">
                        <p className="text-xs font-semibold text-warning mb-1">
                          Internal Notes
                        </p>
                        <p className="text-xs text-warning">{formData.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Panel Footer */}
            {step > 1 && (
              <div className="border-t border-border px-6 py-4 flex items-center justify-between bg-surface">
                <Button variant="ghost" onClick={goBack}>
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  {step < 4 ? (
                    <Button onClick={goNext} disabled={step === 2 && !formData.title.trim()}>
                      Next
                    </Button>
                  ) : (
                    <Button onClick={handleSaveDraft} disabled={saving} loading={saving}>
                      {saving ? 'Saving...' : 'Save as Draft'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Detail / Send / Sign Panel ── */}
      {(detailAgreement || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} />

          {/* Panel */}
          <div className="relative w-full md:w-2/3 lg:w-1/2 max-h-[90vh] bg-surface rounded-card border border-border flex flex-col shadow-card-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="h-section">
                {detailAgreement ? detailAgreement.title : 'Loading...'}
              </h2>
              <button
                onClick={closeDetail}
                className="text-ink-3 hover:text-ink-2 w-8 h-8 flex items-center justify-center rounded-control hover:bg-surface-2 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading && !detailAgreement ? (
                <div className="flex justify-center py-20">
                  <Spinner />
                </div>
              ) : detailAgreement ? (
                (() => {
                  const da: Agreement = detailAgreement
                  return (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge tone="neutral">
                      {TYPE_CONFIG[da.type].icon} {TYPE_CONFIG[da.type].label}
                    </Badge>
                    <Badge tone={STATUS_TONE[da.status]}>
                      {STATUS_CONFIG[da.status].label}
                    </Badge>
                    <span className="text-xs text-ink-3">
                      Created {formatDate(da.createdAt)}
                      {da.expiresAt && ` · Expires ${formatDate(da.expiresAt)}`}
                    </span>
                  </div>

                  {/* Send Result Banner */}
                  {sendResult && (
                    <div className="bg-warning-soft border border-warning/30 rounded-control p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-warning">
                          Agreement Sent for Signing
                        </h3>
                        <button
                          onClick={() => setSendResult(null)}
                          className="text-warning hover:text-warning text-sm"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-xs text-warning mb-3">
                        Each party has been emailed a signing link and OTP.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sendResult.map((r: { partyEmail: string; emailSent: boolean; signingLink: string }) => (
                          <div key={r.partyEmail} className="bg-surface border border-warning/30 rounded-control p-2">
                            <p className="text-xs font-medium text-ink">{r.partyEmail}</p>
                            <p className={`text-xs ${r.emailSent ? 'text-success' : 'text-danger'}`}>
                              {r.emailSent ? 'Email sent' : 'Email failed to send — check email integration configuration'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Content */}
                  <div>
                    <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider mb-2">
                      Agreement Content
                    </h3>
                    <div className="bg-bg border border-border rounded-control p-4 max-h-80 overflow-y-auto">
                      <pre className="text-xs text-ink-2 whitespace-pre-wrap font-mono leading-relaxed">
                        {da.content}
                      </pre>
                    </div>
                    <p className="text-xs text-ink-3 mt-2">
                      <span className="font-medium text-ink-3">Governing Law:</span>{' '}
                      {da.governingLaw} ·{' '}
                      <span className="font-medium text-ink-3">Jurisdiction:</span>{' '}
                      {da.jurisdiction || 'Not specified'}
                    </p>
                  </div>

                  {/* Parties & Signatures */}
                  <div>
                    <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider mb-2">
                      Parties & Signatures
                    </h3>
                    <div className="space-y-2">
                      {da.parties.map((party: Party, i: number) => {
                        const sig = da.signatures?.find((s: Signature) => s.partyEmail === party.email)
                        const hasSigned = !!sig?.signedAt
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 p-3 bg-bg border border-border rounded-control"
                          >
                            <div>
                              <p className="text-sm font-medium text-ink">{party.name}</p>
                              <p className="text-xs text-ink-3">{party.email}</p>
                              <p className="text-xs text-ink-3">{party.role}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {hasSigned ? (
                                <div>
                                  <span className="text-xs text-success font-medium">Signed</span>
                                  <p className="text-xs text-ink-3">
                                    {sig?.signedAt ? formatDate(sig.signedAt) : ''}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-warning font-medium">Pending</span>
                              )}
                              {!hasSigned &&
                                ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'].includes(da.status) && (
                                  <button
                                    onClick={() => setSigningParty({ name: party.name, email: party.email })}
                                    className="mt-1 block text-xs text-accent hover:text-accent font-medium"
                                  >
                                    Sign Now
                                  </button>
                                )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                    {da.status === 'DRAFT' && (
                      <Button
                        variant="secondary"
                        onClick={() => handleSendForSigning(da._id, da.parties)}
                        disabled={actionLoading}
                        loading={actionLoading}
                      >
                        {actionLoading ? 'Sending...' : 'Send for Signing'}
                      </Button>
                    )}
                    {!['FULLY_SIGNED', 'CANCELLED', 'EXPIRED'].includes(da.status) && (
                      <Button
                        variant="danger"
                        onClick={() => handleCancelAgreement(da._id)}
                        disabled={actionLoading}
                        loading={actionLoading}
                      >
                        {actionLoading ? 'Cancelling...' : 'Cancel Agreement'}
                      </Button>
                    )}
                    {da.status === 'FULLY_SIGNED' && (
                      <Button
                        variant="success"
                        onClick={() => window.open(`/agreements/${da._id}`, '_blank')}
                      >
                        View / Download Signed Copy
                      </Button>
                    )}
                  </div>

                  <div className="bg-accent-soft border border-accent/20 rounded-control p-4">
                    <p className="text-xs font-medium text-accent mb-1">Legal Notice</p>
                    <p className="text-xs text-ink-3 leading-relaxed">
                      Electronic signatures on this agreement are valid under Section 5 of the
                      Information Technology Act, 2000, and are admissible as evidence under the
                      Indian Evidence Act, 1872.
                    </p>
                  </div>
                </div>
                  )
                })()
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ── Signing Modal ── */}
      {signingParty && detailAgreement && (
        <SigningModal
          partyName={signingParty.name}
          partyEmail={signingParty.email}
          agreementId={detailAgreement._id}
          onClose={() => setSigningParty(null)}
          onSigned={() => {
            setSigningParty(null)
            refreshDetail(detailAgreement._id)
            patchAgreement(detailAgreement._id, { status: 'PARTIALLY_SIGNED' as AgreementStatus })
          }}
        />
      )}
    </div>
  )
}
