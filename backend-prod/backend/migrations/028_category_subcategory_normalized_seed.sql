-- ============================================================
-- Monytix SpendSense: New Category Taxonomy (India-first)
-- - Idempotent upserts (ON CONFLICT)
-- - Deactivates categories not in the new set
-- - Rich subcategories incl. pan shop, OTT, wallets, etc.
-- - txn_type buckets: needs | wants | income | assets | transfer | fees | tax
-- ============================================================

BEGIN;

SET search_path TO spendsense, public;

-- Ensure txn_type check allows new buckets
ALTER TABLE dim_category
  DROP CONSTRAINT IF EXISTS dim_category_txn_type_check;
ALTER TABLE dim_category
  ADD CONSTRAINT dim_category_txn_type_check
    CHECK (txn_type IN ('income','needs','wants','assets','transfer','fees','tax'));

-- Helper: activate a category list, everything else -> inactive
-- (Run after upserts)
-- NOTE: keep this list in sync with inserts below
WITH keep AS (
  SELECT UNNEST(ARRAY[
    'income','transfers_in','transfers_out',
    'loans_payments','investments_commitments','insurance_premiums',
    'housing_fixed','utilities','entertainment','food_dining',
    'groceries','medical','fitness','transport','shopping',
    'child_care','motor_maintenance','pets','banks','govt_tax','education'
  ]) AS category_code
)
UPDATE dim_category c
SET active = (c.category_code IN (SELECT category_code FROM keep))
;

-- ======================
-- CATEGORIES (upsert)
-- ======================

INSERT INTO dim_category (category_code, category_name, txn_type, display_order, active)
VALUES
  ('income','Income','income',  5, TRUE),
  ('transfers_in','Transfers In','transfer', 7, TRUE),
  ('transfers_out','Transfers Out','transfer', 8, TRUE),

  ('loans_payments','Loan Payments (EMIs)','needs', 10, TRUE),
  ('investments_commitments','Regular Investments / Commitments','assets', 12, TRUE),
  ('insurance_premiums','Insurance Premiums','needs', 14, TRUE),

  ('housing_fixed','Housing (Rent & Society)','needs', 16, TRUE),
  ('utilities','Utilities','needs', 18, TRUE),

  ('entertainment','Entertainment & OTT','wants', 30, TRUE),
  ('food_dining','Food & Dining / Nightlife','wants', 32, TRUE),

  ('groceries','Groceries','needs', 34, TRUE),
  ('medical','Medical & Healthcare','needs', 36, TRUE),
  ('fitness','Fitness & Sports','wants', 38, TRUE),

  ('transport','Transport & Travel','needs', 40, TRUE),
  ('shopping','Shopping & Retail','wants', 42, TRUE),

  ('education','Education','needs', 44, TRUE),
  ('child_care','Child Care','needs', 46, TRUE),

  ('motor_maintenance','Motor Maintenance','needs', 48, TRUE),
  ('pets','Pets','wants', 50, TRUE),

  ('banks','Bank Interest & Fees','fees', 60, TRUE),
  ('govt_tax','Government Taxes','tax', 62, TRUE)
ON CONFLICT (category_code) DO UPDATE
SET category_name = EXCLUDED.category_name,
    txn_type      = EXCLUDED.txn_type,
    display_order = EXCLUDED.display_order,
    active        = TRUE
;

-- ======================
-- SUBCATEGORIES (upsert)
-- ======================

-- INCOME
INSERT INTO dim_subcategory (subcategory_code, category_code, subcategory_name, display_order, active) VALUES
  ('inc_salary','income','Salary / Payroll', 10, TRUE),
  ('inc_side','income','Side Income / Freelance', 11, TRUE),
  ('inc_business','income','Business Income', 12, TRUE),
  ('inc_interest','income','Interest Income', 13, TRUE),
  ('inc_dividend','income','Dividends', 14, TRUE),
  ('inc_tax_refund','income','Tax Refund', 15, TRUE),
  ('inc_other','income','Other Income', 19, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code = EXCLUDED.category_code,
    subcategory_name = EXCLUDED.subcategory_name,
    display_order = EXCLUDED.display_order,
    active = TRUE;

-- TRANSFERS
INSERT INTO dim_subcategory VALUES
  ('tr_in_deposit','transfers_in','Cash/Cheque/ATM Deposit', 10, TRUE),
  ('tr_in_savings','transfers_in','Savings Sweep / Sweep In', 12, TRUE),
  ('tr_in_invest_ret','transfers_in','From Investments / PF / Retirement', 14, TRUE),
  ('tr_in_internal','transfers_in','Account Transfer In', 16, TRUE),
  ('tr_in_other','transfers_in','Other Transfer In', 18, TRUE),

  ('tr_out_savings','transfers_out','Transfer to Savings/Joint', 10, TRUE),
  ('tr_out_atm','transfers_out','Cash / ATM Withdrawal', 12, TRUE),
  ('tr_out_wallet','transfers_out','Bank → Wallet / UPI', 14, TRUE),
  ('tr_out_sweep','transfers_out','Sweep Out (FD / Linked)', 16, TRUE),
  ('tr_out_other','transfers_out','Other Transfer Out', 18, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- LOANS / COMMITMENTS / INSURANCE
INSERT INTO dim_subcategory VALUES
  ('loan_home','loans_payments','Home Loan EMI', 10, TRUE),
  ('loan_car','loans_payments','Car Loan EMI', 11, TRUE),
  ('loan_bike','loans_payments','Two-Wheeler EMI', 12, TRUE),
  ('loan_personal','loans_payments','Personal Loan EMI', 13, TRUE),
  ('loan_student','loans_payments','Education Loan EMI', 14, TRUE),
  ('loan_cc_bill','loans_payments','Credit Card Bill Payment', 15, TRUE),
  ('loan_other','loans_payments','Other Loan/Debt Payment', 19, TRUE),

  ('inv_sip','investments_commitments','Mutual Fund SIP', 10, TRUE),
  ('inv_nps','investments_commitments','NPS', 11, TRUE),
  ('inv_fd_rd','investments_commitments','FD / RD', 12, TRUE),
  ('inv_ppf','investments_commitments','PPF', 13, TRUE),
  ('inv_stocks','investments_commitments','Stocks / ETFs', 14, TRUE),
  ('inv_gold','investments_commitments','Gold / SGB', 15, TRUE),

  ('ins_life','insurance_premiums','Life Insurance', 10, TRUE),
  ('ins_health','insurance_premiums','Health Insurance', 11, TRUE),
  ('ins_motor','insurance_premiums','Motor Insurance', 12, TRUE),
  ('ins_home_other','insurance_premiums','Home / Other Insurance', 13, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- HOUSING / UTILITIES
INSERT INTO dim_subcategory VALUES
  ('house_rent','housing_fixed','Rent', 10, TRUE),
  ('house_society','housing_fixed','Society / Maintenance', 11, TRUE),
  ('house_maid','housing_fixed','Maid / Security / House Help', 12, TRUE),

  ('util_electricity','utilities','Electricity', 10, TRUE),
  ('util_water','utilities','Water', 11, TRUE),
  ('util_gas_lpg','utilities','Gas / LPG / PNG', 12, TRUE),
  ('util_broadband','utilities','Internet / Broadband', 13, TRUE),
  ('util_mobile','utilities','Mobile / Telephone', 14, TRUE),
  ('util_dth_cable','utilities','DTH / Cable TV', 15, TRUE),
  ('util_sewage_waste','utilities','Sewage / Waste Mgmt', 16, TRUE),
  ('util_other','utilities','Other Utilities', 19, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- ENTERTAINMENT (incl. OTT)
INSERT INTO dim_subcategory VALUES
  ('ent_movies_ott','entertainment','Movies & TV / OTT', 10, TRUE),
  ('ent_music','entertainment','Music & Audio', 11, TRUE),
  ('ent_gaming','entertainment','Video Games & eSports', 12, TRUE),
  ('ent_sports_events','entertainment','Sporting Events & Tickets', 13, TRUE),
  ('ent_amusement','entertainment','Amusement Parks & Events', 14, TRUE),
  ('ent_museums_arts','entertainment','Museums & Art Exhibitions', 15, TRUE),
  ('ent_casinos','entertainment','Casinos & Gambling', 16, TRUE),
  ('ent_adventure','entertainment','Adventure & Recreation', 17, TRUE),
  ('ent_nightlife','entertainment','Nightlife & Parties', 18, TRUE),
  ('ent_cultural','entertainment','Cultural & Festive Events', 19, TRUE),
  ('ent_other','entertainment','Other Entertainment', 20, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- FOOD & DINING (incl. pan shop)
INSERT INTO dim_subcategory VALUES
  ('fd_quick_service','food_dining','Quick Service / Fast Food', 10, TRUE),
  ('fd_fine','food_dining','Fine & Casual Dining', 11, TRUE),
  ('fd_cafes','food_dining','Cafés & Bakeries', 12, TRUE),
  ('fd_pubs_bars','food_dining','Pubs & Bars', 13, TRUE),
  ('fd_street_food','food_dining','Street Food & Local Eateries', 14, TRUE),
  ('fd_pan_shop','food_dining','Pan / Cigarette Shop', 15, TRUE),
  ('fd_online','food_dining','Online Food Delivery (Swiggy/Zomato)', 16, TRUE),
  ('fd_desserts','food_dining','Desserts & Sweet Shops', 17, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- GROCERIES
INSERT INTO dim_subcategory VALUES
  ('groc_hyper','groceries','Hypermarkets / Department Stores', 10, TRUE),
  ('groc_online','groceries','Online Groceries / Q-commerce', 11, TRUE),
  ('groc_fv','groceries','Vegetable & Fruit Stores', 12, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- MEDICAL / FITNESS
INSERT INTO dim_subcategory VALUES
  ('med_dental','medical','Dental Care', 10, TRUE),
  ('med_eye','medical','Eye Care / Optometry', 11, TRUE),
  ('med_general','medical','General / Hospitals / Nursing', 12, TRUE),
  ('med_pharma','medical','Pharmacies & Supplements', 13, TRUE),
  ('med_apps','medical','Medical Apps / Services', 14, TRUE),
  ('med_other','medical','Other Medical', 19, TRUE),

  ('fit_gyms','fitness','Gyms & Fitness Centers', 10, TRUE),
  ('fit_sports','fitness','Sports & Coaching / Gear', 11, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- TRANSPORT & TRAVEL
INSERT INTO dim_subcategory VALUES
  ('tr_apps','transport','Transport Apps (Uber/Ola etc.)', 10, TRUE),
  ('tr_public','transport','Public Transit (Rail/Metro/Bus)', 11, TRUE),
  ('tr_taxis','transport','Taxis / Auto / Ride-share', 12, TRUE),
  ('tr_tolls','transport','Tolls / FASTag', 13, TRUE),
  ('tr_travel','transport','Flights / Bus / Train / Cruise', 14, TRUE),
  ('tr_lodging','transport','Hotels / Stays / Airbnb', 15, TRUE),
  ('tr_other','transport','Other Transport', 19, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- SHOPPING & RETAIL
INSERT INTO dim_subcategory VALUES
  ('shop_clothing','shopping','Clothing & Accessories', 10, TRUE),
  ('shop_electronics','shopping','Electronics & Gadgets', 11, TRUE),
  ('shop_marketplaces','shopping','Online Marketplaces', 12, TRUE),
  ('shop_beauty','shopping','Beauty & Personal Care', 13, TRUE),
  ('shop_stationery','shopping','Stationery & Office Supplies', 14, TRUE),
  ('shop_home_kitchen','shopping','Home & Kitchen / Furnishings', 15, TRUE),
  ('shop_gifts','shopping','Gifts & Novelties', 16, TRUE),
  ('shop_books_media','shopping','Books & Media', 17, TRUE),
  ('shop_hobbies','shopping','Hobbies & Crafts', 18, TRUE),
  ('shop_pet_supplies','shopping','Pet Supplies', 19, TRUE),
  ('shop_sports_outdoor','shopping','Sports & Outdoor', 20, TRUE),
  ('shop_auto_supplies','shopping','Automotive Supplies', 21, TRUE),
  ('shop_children_toys','shopping','Children & Toys', 22, TRUE),
  ('shop_general','shopping','General Merchandise', 29, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- EDUCATION / CHILD CARE
INSERT INTO dim_subcategory VALUES
  ('edu_school_fees','education','School / College Fees', 10, TRUE),
  ('edu_tuition','education','Tuition / Coaching', 11, TRUE),
  ('edu_online','education','Online Courses / Certifications', 12, TRUE),

  ('child_education','child_care','Child Education Expenses', 10, TRUE),
  ('child_daycare','child_care','Daycare / Babysitting', 11, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- MOTOR MAINTENANCE / PETS
INSERT INTO dim_subcategory VALUES
  ('motor_services','motor_maintenance','General Services / Repairs', 10, TRUE),
  ('motor_insurance','motor_maintenance','Motor Insurance', 11, TRUE),

  ('pet_grooming','pets','Grooming / Boarding / Bathing', 10, TRUE),
  ('pet_food','pets','Pet Food', 11, TRUE),
  ('pet_vaccine','pets','Vaccination / Vet', 12, TRUE),
  ('pet_insurance','pets','Pet Insurance', 13, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

-- BANKS & TAX
INSERT INTO dim_subcategory VALUES
  ('bank_interest','banks','Interest Credit (Bank)', 10, TRUE),
  ('bank_charges','banks','Bank Charges / Fees', 11, TRUE),
  ('bank_sweep','banks','Savings Sweep / Auto', 12, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

INSERT INTO dim_subcategory VALUES
  ('tax_income','govt_tax','Income Tax / TDS', 10, TRUE),
  ('tax_gst','govt_tax','GST / Challan', 11, TRUE),
  ('tax_other','govt_tax','Other Government Taxes', 19, TRUE)
ON CONFLICT (subcategory_code) DO UPDATE
SET category_code=EXCLUDED.category_code, subcategory_name=EXCLUDED.subcategory_name,
    display_order=EXCLUDED.display_order, active=TRUE;

COMMIT;
