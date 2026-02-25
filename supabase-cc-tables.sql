-- ═══════════════════════════════════════════════════════
-- Carter-Cash — Tables + Données historiques
-- À exécuter dans le SQL Editor Supabase (projet refap-chatbot-core)
-- ═══════════════════════════════════════════════════════

-- 1. TABLES
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS cc_centres (
  code TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  couleur TEXT,
  loyer_mensuel INT NOT NULL,
  date_installation DATE NOT NULL,
  annee_contrat TEXT,
  actif BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS cc_ventes_mensuelles (
  id SERIAL PRIMARY KEY,
  mois TEXT NOT NULL,
  code_centre TEXT NOT NULL,
  nb_fap INT NOT NULL DEFAULT 0,
  ca_ht DECIMAL(10,2),
  partiel BOOLEAN DEFAULT false,
  date_snapshot DATE,
  UNIQUE(mois, code_centre)
);

CREATE TABLE IF NOT EXISTS cc_marges_mensuelles (
  id SERIAL PRIMARY KEY,
  mois TEXT NOT NULL,
  code_centre TEXT NOT NULL,
  marge_brute INT NOT NULL DEFAULT 0,
  loyer_prorate INT NOT NULL DEFAULT 0,
  UNIQUE(mois, code_centre)
);

CREATE TABLE IF NOT EXISTS cc_marges_exercice (
  id SERIAL PRIMARY KEY,
  exercice TEXT NOT NULL,
  code_centre TEXT NOT NULL,
  marge_brute_exercice INT NOT NULL,
  loyer_cumule INT NOT NULL DEFAULT 0,
  date_pdf DATE NOT NULL,
  UNIQUE(exercice, code_centre)
);

CREATE TABLE IF NOT EXISTS cc_snapshots_journaliers (
  id SERIAL PRIMARY KEY,
  date_snapshot DATE NOT NULL UNIQUE,
  n801 INT DEFAULT 0,
  n065 INT DEFAULT 0,
  n003 INT DEFAULT 0,
  n006 INT DEFAULT 0,
  autres INT DEFAULT 0,
  ca_ht DECIMAL(10,2)
);

-- 2. DONNÉES
-- ---------------------------------------------------------

-- Centres
INSERT INTO cc_centres VALUES
  ('801','Thiais (94)','#f97316',3500,'2025-05-22','An1',true),
  ('065','Lambres (59)','#ef4444',2250,'2023-11-21','An3',true),
  ('003','Villeneuve d''Ascq (59)','#3b82f6',3500,'2025-12-18','An1',true),
  ('006','Sarcelles (95)','#8b5cf6',3500,'2026-01-28','An1',true)
ON CONFLICT (code) DO NOTHING;

-- Ventes mensuelles
INSERT INTO cc_ventes_mensuelles (mois,code_centre,nb_fap,ca_ht,partiel,date_snapshot) VALUES
  ('2025-10','801',85,NULL,false,'2025-10-31'),
  ('2025-10','065',63,NULL,false,'2025-10-31'),
  ('2025-10','003',0,NULL,false,'2025-10-31'),
  ('2025-10','006',0,NULL,false,'2025-10-31'),
  ('2025-10','autres',43,NULL,false,'2025-10-31'),
  ('2025-10','total',0,23792,false,'2025-10-31'),
  ('2025-11','801',67,NULL,false,'2025-11-30'),
  ('2025-11','065',51,NULL,false,'2025-11-30'),
  ('2025-11','003',0,NULL,false,'2025-11-30'),
  ('2025-11','006',0,NULL,false,'2025-11-30'),
  ('2025-11','autres',39,NULL,false,'2025-11-30'),
  ('2025-11','total',0,20061,false,'2025-11-30'),
  ('2025-12','801',64,NULL,false,'2025-12-30'),
  ('2025-12','065',52,NULL,false,'2025-12-30'),
  ('2025-12','003',8,NULL,false,'2025-12-30'),
  ('2025-12','006',0,NULL,false,'2025-12-30'),
  ('2025-12','autres',44,NULL,false,'2025-12-30'),
  ('2025-12','total',0,22277,false,'2025-12-30'),
  ('2026-01','801',65,NULL,false,'2026-01-31'),
  ('2026-01','065',51,NULL,false,'2026-01-31'),
  ('2026-01','003',18,NULL,false,'2026-01-31'),
  ('2026-01','006',6,NULL,false,'2026-01-31'),
  ('2026-01','autres',18,NULL,false,'2026-01-31'),
  ('2026-01','total',0,19160,false,'2026-01-31'),
  ('2026-02','801',38,NULL,true,'2026-02-19'),
  ('2026-02','065',46,NULL,true,'2026-02-19'),
  ('2026-02','003',5,NULL,true,'2026-02-19'),
  ('2026-02','006',26,NULL,true,'2026-02-19'),
  ('2026-02','autres',25,NULL,true,'2026-02-19'),
  ('2026-02','total',0,16842,true,'2026-02-19')
ON CONFLICT (mois,code_centre) DO NOTHING;

-- Marges mensuelles
INSERT INTO cc_marges_mensuelles (mois,code_centre,marge_brute,loyer_prorate) VALUES
  ('2025-10','801',9464,3500),('2025-10','065',7281,2250),
  ('2025-10','003',0,0),('2025-10','006',0,0),('2025-10','autres',4140,0),
  ('2025-11','801',7719,3500),('2025-11','065',5958,2250),
  ('2025-11','003',0,0),('2025-11','006',0,0),('2025-11','autres',3961,0),
  ('2025-12','801',7363,3500),('2025-12','065',6290,2250),
  ('2025-12','003',373,1468),('2025-12','006',0,0),('2025-12','autres',5187,0),
  ('2026-01','801',7196,3500),('2026-01','065',6041,2250),
  ('2026-01','003',1943,3500),('2026-01','006',101,339),('2026-01','autres',2532,0),
  ('2026-02','801',4093,2375),('2026-02','065',5545,1527),
  ('2026-02','003',538,2375),('2026-02','006',2520,2375),('2026-02','autres',2521,0)
ON CONFLICT (mois,code_centre) DO NOTHING;

-- Marges exercice (source PDF 19/02/2026 — NE PAS recalculer)
INSERT INTO cc_marges_exercice (exercice,code_centre,marge_brute_exercice,loyer_cumule,date_pdf) VALUES
  ('oct25-fev26','801',36084,18375,'2026-02-19'),
  ('oct25-fev26','065',31114,12777,'2026-02-19'),
  ('oct25-fev26','003',3391,7343,'2026-02-19'),
  ('oct25-fev26','006',3057,2714,'2026-02-19'),
  ('oct25-fev26','autres',18543,0,'2026-02-19')
ON CONFLICT (exercice,code_centre) DO NOTHING;

-- Snapshots journaliers
INSERT INTO cc_snapshots_journaliers (date_snapshot,n801,n065,n003,n006,autres,ca_ht) VALUES
  ('2025-10-28',3,0,0,0,4,1036),
  ('2025-10-31',3,5,0,0,0,868),
  ('2025-12-30',2,3,0,0,0,621),
  ('2026-01-04',5,3,0,0,1,1118),
  ('2026-01-19',4,3,6,0,3,1325),
  ('2026-01-24',2,3,2,0,1,620),
  ('2026-01-31',4,1,2,0,0,744),
  ('2026-02-15',22,3,4,0,16,10925),
  ('2026-02-19',4,0,0,1,1,662)
ON CONFLICT (date_snapshot) DO NOTHING;

-- 3. VALIDATION
-- ---------------------------------------------------------
-- Doit retourner 92189
SELECT SUM(marge_brute_exercice) AS total_mb_exercice
FROM cc_marges_exercice
WHERE exercice = 'oct25-fev26';
