--
-- PostgreSQL database dump
--

\restrict xsbHI6zQOWS1iDWRbjkIwaswh4X0l3yL2KlH81QC47YX83YTZat4hIeM1VF1uAY

-- Dumped from database version 17.8 (6108b59)
-- Dumped by pg_dump version 17.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: active_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_groups (
    id integer NOT NULL,
    user_id text NOT NULL,
    group_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: active_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.active_groups ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.active_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bot_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_status (
    user_id text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cielo_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cielo_webhook_events (
    id integer NOT NULL,
    payment_id text,
    recurrent_payment_id text,
    change_type integer NOT NULL,
    raw_payload jsonb NOT NULL,
    processed_at timestamp without time zone,
    processing_error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cielo_webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cielo_webhook_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cielo_webhook_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id integer NOT NULL,
    code text NOT NULL,
    discount_type text,
    discount_value integer,
    discount_duration_months integer,
    extra_group_price_in_cents integer,
    bonus_groups integer DEFAULT 0 NOT NULL,
    restricted_to_user_id text,
    restricted_to_plan_id integer,
    valid_from timestamp without time zone DEFAULT now() NOT NULL,
    valid_until timestamp without time zone,
    max_redemptions integer,
    current_redemptions integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.coupons ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.coupons_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: messages_enqueued; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages_enqueued (
    id integer NOT NULL,
    queue_name text NOT NULL,
    message_data jsonb NOT NULL,
    user_id text,
    enqueued_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: messages_enqueued_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.messages_enqueued ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.messages_enqueued_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: messages_processed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages_processed (
    id integer NOT NULL,
    queue_name text NOT NULL,
    message_data jsonb NOT NULL,
    user_id text,
    status text NOT NULL,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    processed_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: messages_processed_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.messages_processed ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.messages_processed_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: miles_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.miles_programs (
    id integer NOT NULL,
    name text NOT NULL,
    liminar_of_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: miles_programs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.miles_programs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.miles_programs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id integer NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: otp_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.otp_codes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.otp_codes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prompt_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_configs (
    id integer NOT NULL,
    key text NOT NULL,
    prompt_id text NOT NULL,
    version text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: prompt_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.prompt_configs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.prompt_configs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    request_id text NOT NULL,
    logged_in_user_id bigint NOT NULL,
    telegram_user_id bigint,
    phone_number text,
    chat_id bigint,
    state text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone,
    source text DEFAULT 'telegram'::text NOT NULL
);


--
-- Name: subscription_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_payments (
    id integer NOT NULL,
    subscription_id integer NOT NULL,
    cielo_payment_id text,
    amount_in_cents integer NOT NULL,
    status text NOT NULL,
    cielo_return_code text,
    cielo_return_message text,
    authorization_code text,
    paid_at timestamp without time zone,
    failed_at timestamp without time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subscription_payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subscription_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id integer NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    price_in_cents integer NOT NULL,
    group_limit integer,
    duration_days integer,
    features jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    promotional_price_in_cents integer,
    promotional_months integer
);


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subscription_plans ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subscription_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    user_id text NOT NULL,
    plan_id integer NOT NULL,
    status text NOT NULL,
    cielo_recurrent_payment_id text,
    cielo_card_token text,
    card_last_four_digits text,
    card_brand text,
    start_date timestamp without time zone DEFAULT now() NOT NULL,
    current_period_start timestamp without time zone DEFAULT now() NOT NULL,
    current_period_end timestamp without time zone NOT NULL,
    next_billing_date timestamp without time zone,
    canceled_at timestamp without time zone,
    cancel_reason text,
    trial_used boolean DEFAULT false NOT NULL,
    extra_groups integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    promotional_payments_remaining integer DEFAULT 0 NOT NULL,
    coupon_id integer,
    bonus_groups integer DEFAULT 0 NOT NULL,
    coupon_discount_months_remaining integer DEFAULT 0 NOT NULL
);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_available_miles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_available_miles (
    id integer NOT NULL,
    user_id text NOT NULL,
    program_id integer NOT NULL,
    available_miles integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_available_miles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_available_miles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_available_miles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_counter_offer_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_counter_offer_settings (
    user_id text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    price_threshold real DEFAULT 0.5 NOT NULL,
    message_template_id integer DEFAULT 1 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    call_to_action_template_id integer DEFAULT 1 NOT NULL
);


--
-- Name: user_max_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_max_prices (
    id integer NOT NULL,
    user_id text NOT NULL,
    program_id integer NOT NULL,
    max_price real NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    min_quantity integer DEFAULT 0 NOT NULL
);


--
-- Name: user_max_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_max_prices ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_max_prices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_price_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_price_entries (
    id integer NOT NULL,
    user_id text NOT NULL,
    program_id integer NOT NULL,
    quantity integer NOT NULL,
    price real NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_price_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_price_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_price_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    phone text NOT NULL,
    telegram_user_id bigint NOT NULL,
    chat_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: web_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: worker_ports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_ports (
    user_id text NOT NULL,
    port integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: -
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
20	c898381288bfda0c4859010c4f11d5028cbe38659657aa5465595c6b4a32351c	1771539053607
\.


--
-- Data for Name: active_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.active_groups (id, user_id, group_id, created_at) FROM stdin;
112	8425872990	-5075073206	2026-01-29 15:07:46.31375
241	6673618605	-1001636815302	2026-02-18 18:30:52.70966
244	871681361	-1001691382727	2026-02-19 16:36:34.567172
245	871681361	-1001342221518	2026-02-19 16:36:48.957247
248	871681361	-1003289695787	2026-02-19 16:59:42.943126
250	871681361	-1002113207657	2026-02-19 17:51:23.495403
251	398791170	-5059491950	2026-02-19 19:00:26.234551
130	173289054	-5059491950	2026-02-01 14:59:59.847179
131	173289054	-5075073206	2026-02-01 14:59:59.847179
255	398791170	-1001636815302	2026-02-19 21:37:25.323072
256	398791170	-1002113207657	2026-02-19 21:37:26.844836
257	398791170	-1001483597140	2026-02-19 21:37:33.519989
206	7323873340	-5295780129	2026-02-13 23:33:55.228642
210	6673618605	-5107279967	2026-02-14 02:06:16.73464
216	6673618605	-1002113207657	2026-02-15 13:31:17.471337
153	8532513170	-5059491950	2026-02-07 03:26:14.584057
157	7323873340	-1001636815302	2026-02-12 20:30:30.097771
158	7323873340	-1002113207657	2026-02-12 20:30:31.288444
159	7323873340	-1001342221518	2026-02-12 20:30:33.275319
160	7323873340	-1001691382727	2026-02-12 20:30:36.183237
172	7323873340	-1003578994572	2026-02-12 23:14:10.475201
\.


--
-- Data for Name: bot_status; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bot_status (user_id, is_enabled, updated_at) FROM stdin;
7323873340	t	2026-02-17 17:27:47.473
8425872990	t	2026-02-07 02:05:15.849
8532513170	t	2026-02-07 03:25:52.709
6895700442	t	2026-02-19 15:42:34.347
871681361	t	2026-02-19 15:54:15.871
6673618605	t	2026-02-19 16:23:52.23
173289054	t	2026-02-19 18:58:01.132
1661337430	t	2026-02-13 01:02:01.267
398791170	t	2026-02-19 18:59:11.211
\.


--
-- Data for Name: cielo_webhook_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cielo_webhook_events (id, payment_id, recurrent_payment_id, change_type, raw_payload, processed_at, processing_error, created_at) FROM stdin;
1	12aa7247-7f4d-43ce-b4ec-9885ef7dfbe8	\N	1	{"PaymentId": "12aa7247-7f4d-43ce-b4ec-9885ef7dfbe8", "ChangeType": 1}	\N	Cielo query API error: 404 - 	2026-02-17 00:09:12.949499
\.


--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coupons (id, code, discount_type, discount_value, discount_duration_months, extra_group_price_in_cents, bonus_groups, restricted_to_user_id, restricted_to_plan_id, valid_from, valid_until, max_redemptions, current_redemptions, is_active, created_at, updated_at) FROM stdin;
1	ESPECIAL7	fixed	5000	\N	\N	1	\N	3	2026-02-17 16:01:13.268931	\N	1	1	t	2026-02-17 16:01:13.268931	2026-02-17 23:54:06.359
2	ISAAC100	percentage	100	\N	\N	0	173289054	\N	2026-02-18 15:26:43.174839	\N	1	1	t	2026-02-18 15:26:43.174839	2026-02-18 15:29:00.897
4	LUCAS100	percentage	100	\N	\N	0	\N	\N	2026-02-19 01:50:46.61846	\N	1	0	t	2026-02-19 01:50:46.61846	2026-02-19 01:50:46.61846
3	FELIP100	percentage	100	\N	\N	0	\N	\N	2026-02-18 15:30:43.801184	\N	1	1	t	2026-02-18 15:30:43.801184	2026-02-19 03:01:07.037
\.


--
-- Data for Name: messages_enqueued; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages_enqueued (id, queue_name, message_data, user_id, enqueued_at) FROM stdin;
\.


--
-- Data for Name: messages_processed; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages_processed (id, queue_name, message_data, user_id, status, error_message, retry_count, processed_at) FROM stdin;
\.


--
-- Data for Name: miles_programs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.miles_programs (id, name, liminar_of_id, created_at) FROM stdin;
1	SMILES	\N	2026-02-01 14:04:10.065775
2	LUFTHANSA	\N	2026-02-01 14:04:10.066672
6	⁠DELTA / SKY	\N	2026-02-01 14:04:10.071866
7	⁠SUMA/AIR EUROPA	\N	2026-02-01 14:04:10.072687
8	COPA	\N	2026-02-01 14:04:10.073279
10	EMIRATES	\N	2026-02-01 14:04:10.067988
9	ETIHAD	\N	2026-02-01 14:04:10.067237
12	ACCOR / ALL ACCOR	\N	2026-02-01 14:04:10.069293
11	QANTAS	\N	2026-02-01 14:04:10.068669
13	⁠AMERICAN AIRLINES / AA / AADVANTAGE	\N	2026-02-01 14:04:10.090999
14	BRITISH	\N	2026-02-01 14:04:10.102533
15	TAP	\N	2026-02-01 14:04:10.103497
18	AZUL INTERLINE/AZUL PELO MUNDO/AZUL VIAGENS	\N	2026-02-01 14:04:10.104978
16	TURKISH	\N	2026-02-01 14:04:10.103872
17	QATAR	\N	2026-02-01 14:04:10.101194
19	LATAM	\N	2026-02-01 14:04:10.107748
20	⁠AZUL/TUDO AZUL	\N	2026-02-01 14:04:10.11108
21	SMILES LIMINAR	1	2026-02-01 14:05:03.84656
22	LATAM LIMINAR	19	2026-02-01 14:05:03.846916
23	AZUL LIMINAR	20	2026-02-01 14:05:03.84745
5	MILEAGEPLUS / UNITED / MILEAGE	\N	2026-02-01 14:04:10.071286
3	⁠AEROPLAN / AIRCANADA / AIR CANADA	\N	2026-02-01 14:04:10.070087
4	⁠FLYING BLUE / AIRFRANCE / AIR FRANCE	\N	2026-02-01 14:04:10.070734
24	LATAM WALLET	\N	2026-02-04 14:09:53.069237
25	LIFEMILES / AVIANCA	\N	2026-02-19 01:54:32.332167
\.


--
-- Data for Name: otp_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.otp_codes (id, phone, code, expires_at, used_at, attempts, created_at) FROM stdin;
1	+5584987287398	954588	2026-02-06 15:58:31.365	2026-02-06 15:53:38.66	1	2026-02-06 15:53:31.380051
2	+5584996368481	687180	2026-02-06 17:46:09.423	2026-02-06 18:05:47.005	0	2026-02-06 17:41:09.435289
3	+5584996368481	350591	2026-02-06 18:10:47.019	2026-02-06 18:20:05.309	0	2026-02-06 18:05:47.032285
4	+5584996368481	333687	2026-02-06 18:25:05.317	2026-02-06 18:20:26.409	1	2026-02-06 18:20:05.327721
32	+5542998735689	962289	2026-02-13 00:24:33.594	2026-02-13 00:19:42.719	1	2026-02-13 00:19:33.605501
5	+5584996368481	540925	2026-02-06 18:48:49.879	2026-02-06 18:44:05.699	1	2026-02-06 18:43:49.889085
6	+5584996368481	515118	2026-02-06 22:46:35.536	2026-02-06 22:41:54.324	0	2026-02-06 22:41:35.549118
7	+5584996368481	212538	2026-02-06 22:46:54.333	2026-02-06 22:42:01.544	1	2026-02-06 22:41:54.344677
50	+5521981738171	720808	2026-02-19 15:34:12.161	2026-02-19 15:29:20.202	1	2026-02-19 15:29:12.164116
8	+5584996368481	311047	2026-02-06 22:48:02.946	2026-02-06 22:43:17.145	1	2026-02-06 22:43:02.956618
33	+5542998735689	322891	2026-02-13 00:38:35.602	2026-02-13 00:33:47.729	1	2026-02-13 00:33:35.612759
9	+5584996368481	555178	2026-02-06 22:48:44.536	2026-02-06 22:43:59.566	1	2026-02-06 22:43:44.546394
10	+5584987287398	305594	2026-02-06 23:30:10.589	2026-02-06 23:25:24.033	1	2026-02-06 23:25:10.603935
11	+5584987287398	197345	2026-02-06 23:33:43.915	2026-02-06 23:28:50.518	1	2026-02-06 23:28:43.928505
34	+5542998735689	108977	2026-02-13 01:06:48.67	2026-02-13 01:01:57.58	1	2026-02-13 01:01:48.68233
12	+5584987287398	412505	2026-02-07 00:09:03.986	2026-02-07 00:04:09.963	1	2026-02-07 00:04:04.004897
13	+5584987287398	342193	2026-02-07 02:07:32.817	2026-02-07 02:03:01.85	1	2026-02-07 02:02:32.834248
14	+5584994531473	173375	2026-02-07 02:09:06.184	2026-02-07 02:04:20.219	1	2026-02-07 02:04:06.200296
15	+5584996368481	733010	2026-02-07 02:11:38.656	2026-02-07 02:07:15.532	0	2026-02-07 02:06:38.671706
35	+5542998735689	476090	2026-02-13 13:59:59.545	2026-02-13 13:55:40.528	1	2026-02-13 13:54:59.546746
16	+5584996368481	347422	2026-02-07 02:12:15.545	2026-02-07 02:07:24.081	1	2026-02-07 02:07:15.5613
17	+5584996368481	525941	2026-02-07 03:08:31.09	2026-02-07 03:03:44.332	1	2026-02-07 03:03:31.107692
51	+553131816181	518315	2026-02-19 15:38:04.957	2026-02-19 15:33:17.339	1	2026-02-19 15:33:04.959802
18	+5584936180472	817500	2026-02-07 03:29:26.779	2026-02-07 03:24:45.555	1	2026-02-07 03:24:26.793647
36	+5531991817255	940632	2026-02-14 00:14:53.966	2026-02-14 00:10:02.154	1	2026-02-14 00:09:53.967927
19	+5584996368481	298955	2026-02-07 03:46:53.608	2026-02-07 03:42:33.581	1	2026-02-07 03:41:53.621558
20	+5584987287398	864910	2026-02-07 16:27:41.234	2026-02-07 16:22:48.618	1	2026-02-07 16:22:41.248843
37	+5531994016615	185848	2026-02-14 01:12:21.652	2026-02-14 01:08:24.723	0	2026-02-14 01:07:21.653626
21	+5584987287398	748881	2026-02-07 21:04:08.317	2026-02-07 20:59:14.587	1	2026-02-07 20:59:08.327222
22	+5584996368481	647640	2026-02-07 23:07:03.113	2026-02-07 23:03:23.704	0	2026-02-07 23:02:03.125453
23	+5584996368481	233060	2026-02-07 23:08:23.716	2026-02-07 23:03:33.632	1	2026-02-07 23:03:23.727811
24	+5584996368481	810799	2026-02-08 04:55:31.384	2026-02-08 04:50:43.028	1	2026-02-08 04:50:31.401558
38	+5531994016615	568449	2026-02-14 01:13:24.731	2026-02-14 01:09:08.95	1	2026-02-14 01:08:24.732789
25	+5584936180472	175131	2026-02-11 14:18:16.059	2026-02-11 14:13:26.664	1	2026-02-11 14:13:16.075657
26	+5584996368481	517664	2026-02-11 14:20:46.427	2026-02-11 14:16:08.745	0	2026-02-11 14:15:46.442512
27	+5584996368481	186515	2026-02-11 14:21:08.758	2026-02-11 14:16:18.231	1	2026-02-11 14:16:08.772327
28	+5591988811286	863288	2026-02-11 14:21:39.454	\N	0	2026-02-11 14:16:39.468763
29	+5584996368481	972602	2026-02-12 03:06:29.688	2026-02-12 03:01:39.417	1	2026-02-12 03:01:29.700234
39	+5531994016615	241216	2026-02-14 01:14:08.957	2026-02-14 01:09:20.951	1	2026-02-14 01:09:08.959473
30	+5542998735689	452320	2026-02-12 04:51:55.391	2026-02-12 04:47:05.239	1	2026-02-12 04:46:55.403025
40	+5531994016615	883680	2026-02-14 01:24:13.15	\N	0	2026-02-14 01:19:13.151885
31	+5531991817255	296392	2026-02-12 20:31:05.095	2026-02-12 20:26:17.069	1	2026-02-12 20:26:05.1047
52	+5531992004745	143180	2026-02-19 15:57:48.131	2026-02-19 15:52:52.817	1	2026-02-19 15:52:48.133058
41	+5542998735689	526506	2026-02-14 20:59:55.171	2026-02-14 20:55:00.787	1	2026-02-14 20:54:55.173748
42	+5584996368481	827652	2026-02-17 17:09:42.982	2026-02-17 17:04:49.81	1	2026-02-17 17:04:42.984587
53	+5531992004745	491786	2026-02-19 20:29:02.103	2026-02-19 20:24:20.087	0	2026-02-19 20:24:02.104135
43	+5542998735689	761702	2026-02-17 17:40:24.461	2026-02-17 17:35:33.387	1	2026-02-17 17:35:24.463703
44	+5542998735689	886151	2026-02-18 00:03:00.135	2026-02-17 23:58:22.77	1	2026-02-17 23:58:00.137716
45	+5584996368481	663805	2026-02-19 02:26:11.632	2026-02-19 02:21:55.403	1	2026-02-19 02:21:11.633968
54	+5531992004745	786108	2026-02-19 20:29:20.099	2026-02-19 20:24:29.339	1	2026-02-19 20:24:20.09934
46	+5584996368481	480096	2026-02-19 02:35:24.841	2026-02-19 02:30:46.8	1	2026-02-19 02:30:24.84204
47	+5584996368481	767427	2026-02-19 02:36:22.279	2026-02-19 02:31:35.48	1	2026-02-19 02:31:22.28216
48	+5584996368481	132347	2026-02-19 03:11:44.548	2026-02-19 03:06:47.698	1	2026-02-19 03:06:44.551538
49	+5521981738171	147549	2026-02-19 15:31:19.176	2026-02-19 15:29:12.153	0	2026-02-19 15:26:19.178506
\.


--
-- Data for Name: prompt_configs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.prompt_configs (id, key, prompt_id, version, created_at, updated_at) FROM stdin;
1	message_parser_data	pmpt_6973c179c1848197bdaec0682b4096c00a35b58437df78f2	60	2026-02-03 21:24:08.980393	2026-02-03 21:24:08.980393
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (request_id, logged_in_user_id, telegram_user_id, phone_number, chat_id, state, created_at, updated_at, expires_at, source) FROM stdin;
\.


--
-- Data for Name: subscription_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscription_payments (id, subscription_id, cielo_payment_id, amount_in_cents, status, cielo_return_code, cielo_return_message, authorization_code, paid_at, failed_at, retry_count, created_at) FROM stdin;
\.


--
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscription_plans (id, name, display_name, price_in_cents, group_limit, duration_days, features, is_active, created_at, updated_at, promotional_price_in_cents, promotional_months) FROM stdin;
1	trial	Período de Teste	0	3	7	["3 grupos ativos", "Todas as funcionalidades", "Suporte por email"]	f	2026-02-06 22:36:33.54233	2026-02-16 23:56:01.593	\N	\N
4	scale	Scale	49900	\N	\N	["15 grupos ativos", "Todas as funcionalidades", "Suporte prioritário", "Onboarding dedicado"]	t	2026-02-06 22:36:33.678016	2026-02-17 00:05:26.658	34900	3
3	pro	Pro	29900	6	\N	["7 grupos ativos", "Todas as funcionalidades", "Suporte prioritário"]	t	2026-02-06 22:36:33.654943	2026-02-17 00:05:26.638	20900	3
2	starter	Starter	19900	3	\N	["3 grupos ativos", "Todas as funcionalidades", "Suporte por email"]	t	2026-02-06 22:36:33.579103	2026-02-19 21:19:48.601	14900	3
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscriptions (id, user_id, plan_id, status, cielo_recurrent_payment_id, cielo_card_token, card_last_four_digits, card_brand, start_date, current_period_start, current_period_end, next_billing_date, canceled_at, cancel_reason, trial_used, extra_groups, created_at, updated_at, promotional_payments_remaining, coupon_id, bonus_groups, coupon_discount_months_remaining) FROM stdin;
6	6673618605	1	trialing	\N	\N	\N	\N	2026-02-14 01:09:29.296492	2026-02-14 01:09:29.296492	2026-02-21 01:09:29.294	\N	\N	\N	t	0	2026-02-14 01:09:29.296492	2026-02-14 01:09:29.296492	0	\N	0	0
8	1661337430	3	trialing	e2692d95-68c1-4ac1-b660-254e483ab59e	\N	5839	Visa	2026-02-17 23:54:06.333502	2026-02-17 23:54:06.333502	2026-02-24 23:54:04.839	2026-02-24 23:54:04.839	\N	\N	t	0	2026-02-17 23:54:06.333502	2026-02-17 23:54:06.333502	3	1	1	-1
9	173289054	4	trialing	6140df1f-a791-4e1d-85a2-6c70924c68ea	\N	1460	Master	2026-02-18 15:29:00.865347	2026-02-18 15:29:00.865347	2026-02-25 15:29:00.019	2026-02-25 15:29:00.019	\N	\N	t	0	2026-02-18 15:29:00.865347	2026-02-18 15:29:00.865347	3	2	0	-1
10	398791170	4	trialing	89cbf056-cf1c-4d59-99a1-75584b6dd8d8	\N	0702	Master	2026-02-19 03:01:07.009921	2026-02-19 03:01:07.009921	2026-02-26 03:01:05.989	2026-02-26 03:01:05.989	\N	\N	t	0	2026-02-19 03:01:07.009921	2026-02-19 03:01:07.009921	3	3	0	-1
11	6895700442	3	canceled	1992ba5a-e518-4b3a-80df-70483c42bbbe	\N	1684	Master	2026-02-19 15:33:42.692065	2026-02-19 15:33:42.692065	2026-02-26 15:33:41.942	2026-02-26 15:33:41.942	2026-02-19 15:51:25.359	Cancelado pelo usuário	t	0	2026-02-19 15:33:42.692065	2026-02-19 15:51:25.359	3	\N	0	0
12	871681361	3	trialing	2a3ff08c-55c3-41b7-b5d3-02e422c00fbc	\N	1684	Master	2026-02-19 15:53:10.929065	2026-02-19 15:53:10.929065	2026-02-26 15:53:10.667	2026-02-26 15:53:10.667	\N	\N	t	0	2026-02-19 15:53:10.929065	2026-02-19 15:53:10.929065	3	\N	0	0
\.


--
-- Data for Name: user_available_miles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_available_miles (id, user_id, program_id, available_miles, created_at, updated_at) FROM stdin;
1532	1661337430	1	3000000	2026-02-19 03:43:27.227648	2026-02-19 03:43:27.227648
1533	1661337430	14	1200000	2026-02-19 03:43:27.227648	2026-02-19 03:43:27.227648
1534	1661337430	18	750000	2026-02-19 03:43:27.227648	2026-02-19 03:43:27.227648
1535	1661337430	17	1200000	2026-02-19 03:43:27.227648	2026-02-19 03:43:27.227648
1938	398791170	1	1280803	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1536	1661337430	19	1000000	2026-02-19 03:43:27.227648	2026-02-19 03:43:27.227648
1537	1661337430	8	220000	2026-02-19 03:43:27.227648	2026-02-19 03:43:27.227648
1939	398791170	19	53405	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1940	398791170	2	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1941	398791170	5	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1942	398791170	6	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1943	398791170	7	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1944	398791170	8	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1544	871681361	1	4000000	2026-02-19 16:34:44.287606	2026-02-19 16:34:44.287606
1545	871681361	21	4000000	2026-02-19 16:34:44.287606	2026-02-19 16:34:44.287606
1546	871681361	19	4000000	2026-02-19 16:34:44.287606	2026-02-19 16:34:44.287606
1547	871681361	22	4000000	2026-02-19 16:34:44.287606	2026-02-19 16:34:44.287606
1548	871681361	20	4000000	2026-02-19 16:34:44.287606	2026-02-19 16:34:44.287606
1549	871681361	23	4000000	2026-02-19 16:34:44.287606	2026-02-19 16:34:44.287606
1945	398791170	3	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1946	398791170	10	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1947	398791170	9	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1948	398791170	4	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1949	398791170	12	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1950	398791170	11	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1951	398791170	13	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1952	398791170	14	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1953	398791170	15	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1954	398791170	18	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1955	398791170	16	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1956	398791170	17	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1957	398791170	20	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1958	398791170	23	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
1477	6673618605	1	294000	2026-02-17 23:57:47.634538	2026-02-17 23:57:47.634538
1478	6673618605	19	200000	2026-02-17 23:57:47.634538	2026-02-17 23:57:47.634538
1479	6673618605	18	880000	2026-02-17 23:57:47.634538	2026-02-17 23:57:47.634538
1959	398791170	21	0	2026-02-19 21:36:36.096869	2026-02-19 21:36:36.096869
982	7323873340	1	500000	2026-02-12 20:32:36.31311	2026-02-12 20:32:36.31311
1592	173289054	1	50000	2026-02-19 18:16:24.366911	2026-02-19 18:16:24.366911
1593	173289054	21	30000	2026-02-19 18:16:24.366911	2026-02-19 18:16:24.366911
\.


--
-- Data for Name: user_counter_offer_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_counter_offer_settings (user_id, is_enabled, price_threshold, message_template_id, created_at, updated_at, call_to_action_template_id) FROM stdin;
173289054	t	2	1	2026-02-03 03:36:03.005	2026-02-03 03:36:03.005	1
7323873340	f	0	1	2026-02-12 23:13:26.661	2026-02-14 00:10:45.011	5
1661337430	f	0	1	2026-02-12 22:43:09.955	2026-02-14 01:53:34.676	5
398791170	t	0.75	6	2026-02-03 03:23:41.265	2026-02-19 03:06:29.752	4
871681361	t	0.25	6	2026-02-19 16:07:12.035	2026-02-19 16:08:22.472	3
\.


--
-- Data for Name: user_max_prices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_max_prices (id, user_id, program_id, max_price, created_at, updated_at, min_quantity) FROM stdin;
578	1661337430	1	0	2026-02-19 03:43:41.658875	2026-02-19 03:43:41.658875	40000
579	1661337430	14	0	2026-02-19 03:43:41.658875	2026-02-19 03:43:41.658875	1000
580	1661337430	18	0	2026-02-19 03:43:41.658875	2026-02-19 03:43:41.658875	1000
581	1661337430	17	0	2026-02-19 03:43:41.658875	2026-02-19 03:43:41.658875	1000
582	1661337430	19	0	2026-02-19 03:43:41.658875	2026-02-19 03:43:41.658875	100000
583	1661337430	8	0	2026-02-19 03:43:41.658875	2026-02-19 03:43:41.658875	1000
101	7323873340	1	0	2026-02-12 23:12:18.567364	2026-02-12 23:12:18.567364	50000
590	6895700442	21	16.25	2026-02-19 15:37:48.375367	2026-02-19 15:37:48.375367	0
591	6895700442	1	16.25	2026-02-19 15:37:48.375367	2026-02-19 15:37:48.375367	0
592	6895700442	23	15.25	2026-02-19 15:37:48.375367	2026-02-19 15:37:48.375367	0
717	398791170	1	18	2026-02-19 21:36:36.200824	2026-02-19 21:36:36.200824	30000
718	398791170	19	28	2026-02-19 21:36:36.200824	2026-02-19 21:36:36.200824	40000
661	871681361	1	16.25	2026-02-19 17:43:15.802109	2026-02-19 17:43:15.802109	15000
662	871681361	21	0	2026-02-19 17:43:15.802109	2026-02-19 17:43:15.802109	1
663	871681361	19	0	2026-02-19 17:43:15.802109	2026-02-19 17:43:15.802109	1
664	871681361	23	15.25	2026-02-19 17:43:15.802109	2026-02-19 17:43:15.802109	1
665	871681361	20	15.25	2026-02-19 17:43:15.802109	2026-02-19 17:43:15.802109	1
666	871681361	22	0	2026-02-19 17:43:15.802109	2026-02-19 17:43:15.802109	1
674	173289054	1	25	2026-02-19 19:06:23.294145	2026-02-19 19:06:23.294145	0
561	6673618605	19	0	2026-02-18 19:07:29.32814	2026-02-18 19:07:29.32814	40000
562	6673618605	18	0	2026-02-18 19:07:29.32814	2026-02-18 19:07:29.32814	1000
563	6673618605	1	0	2026-02-18 19:07:29.32814	2026-02-18 19:07:29.32814	70000
\.


--
-- Data for Name: user_price_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_price_entries (id, user_id, program_id, quantity, price, created_at, updated_at) FROM stdin;
256	1661337430	18	1	14	2026-02-14 01:52:11.011472	2026-02-14 01:52:11.011472
327	871681361	19	29	28	2026-02-19 17:43:15.740862	2026-02-19 17:43:15.740862
259	6673618605	1	50	16	2026-02-14 02:19:23.273243	2026-02-14 02:19:23.273243
328	871681361	19	30	26	2026-02-19 17:43:15.740862	2026-02-19 17:43:15.740862
261	1661337430	1	1	16	2026-02-14 03:10:02.652816	2026-02-14 03:10:02.652816
262	1661337430	19	100	26	2026-02-14 03:10:43.569342	2026-02-14 03:10:43.569342
329	871681361	19	51	25.75	2026-02-19 17:43:15.740862	2026-02-19 17:43:15.740862
330	871681361	19	100	25.5	2026-02-19 17:43:15.740862	2026-02-19 17:43:15.740862
334	173289054	1	20	24.75	2026-02-19 19:06:23.195709	2026-02-19 19:06:23.195709
273	6673618605	19	40	24.5	2026-02-18 07:03:45.703825	2026-02-18 07:03:45.703825
274	6673618605	18	1	14	2026-02-18 19:07:29.18167	2026-02-18 19:07:29.18167
275	398791170	19	10	28.5	2026-02-19 03:05:27.074918	2026-02-19 03:05:27.074918
276	398791170	19	30	27.75	2026-02-19 03:05:27.074918	2026-02-19 03:05:27.074918
277	398791170	19	50	26.5	2026-02-19 03:05:27.074918	2026-02-19 03:05:27.074918
278	398791170	19	80	26.5	2026-02-19 03:05:27.074918	2026-02-19 03:05:27.074918
210	7323873340	1	1	15.5	2026-02-12 23:12:18.514514	2026-02-12 23:12:18.514514
279	398791170	19	100	26.25	2026-02-19 03:05:27.074918	2026-02-19 03:05:27.074918
280	398791170	1	15	17	2026-02-19 03:07:06.453247	2026-02-19 03:07:06.453247
281	398791170	1	30	16.75	2026-02-19 03:07:06.453247	2026-02-19 03:07:06.453247
282	398791170	1	75	16.25	2026-02-19 03:07:06.453247	2026-02-19 03:07:06.453247
283	398791170	1	100	16	2026-02-19 03:07:06.453247	2026-02-19 03:07:06.453247
284	1661337430	8	1	70	2026-02-19 03:43:41.601389	2026-02-19 03:43:41.601389
285	6895700442	21	1	16.25	2026-02-19 15:35:06.010105	2026-02-19 15:35:06.010105
286	6895700442	1	35	16	2026-02-19 15:35:29.374508	2026-02-19 15:35:29.374508
287	6895700442	1	61	15.75	2026-02-19 15:35:29.374508	2026-02-19 15:35:29.374508
221	1661337430	14	1	57	2026-02-13 00:30:11.867936	2026-02-13 00:30:11.867936
222	1661337430	17	1	57	2026-02-13 00:31:46.208039	2026-02-13 00:31:46.208039
288	6895700442	1	81	15.5	2026-02-19 15:35:29.374508	2026-02-19 15:35:29.374508
289	6895700442	23	1	15.25	2026-02-19 15:35:47.961792	2026-02-19 15:35:47.961792
292	6895700442	19	30	28	2026-02-19 15:37:48.30327	2026-02-19 15:37:48.30327
293	6895700442	19	50	26	2026-02-19 15:37:48.30327	2026-02-19 15:37:48.30327
294	6895700442	19	99	25.75	2026-02-19 15:37:48.30327	2026-02-19 15:37:48.30327
295	6895700442	19	100	2625.5	2026-02-19 15:37:48.30327	2026-02-19 15:37:48.30327
303	871681361	1	35	16	2026-02-19 15:58:56.204934	2026-02-19 15:58:56.204934
304	871681361	1	60	15.75	2026-02-19 15:58:56.204934	2026-02-19 15:58:56.204934
305	871681361	1	81	15.5	2026-02-19 15:58:56.204934	2026-02-19 15:58:56.204934
306	871681361	21	34	16.25	2026-02-19 15:59:15.632275	2026-02-19 15:59:15.632275
320	871681361	20	1	15.25	2026-02-19 16:26:44.580831	2026-02-19 16:26:44.580831
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, phone, telegram_user_id, chat_id, created_at, updated_at) FROM stdin;
4	+5584987287398	173289054	173289054	2026-02-07 00:04:03.946043	2026-02-07 02:02:24.303
5	+5584994531473	8425872990	8425872990	2026-02-07 02:04:06.153885	2026-02-07 02:04:06.153885
8	+5591988811286	6304200988	6304200988	2026-02-11 14:16:39.437124	2026-02-11 14:16:39.437124
9	+5542998735689	1661337430	1661337430	2026-02-12 04:46:55.366344	2026-02-12 04:46:55.366344
10	+5531991817255	7323873340	7323873340	2026-02-12 20:26:05.074018	2026-02-12 20:26:05.074018
11	+5531994016615	6673618605	6673618605	2026-02-14 01:07:21.618391	2026-02-14 01:07:21.618391
13	+5584996368481	398791170	398791170	2026-02-19 02:30:24.81056	2026-02-19 02:30:24.81056
14	+5521981738171	7096037854	7096037854	2026-02-19 15:26:19.141118	2026-02-19 15:26:19.141118
15	+553131816181	6895700442	6895700442	2026-02-19 15:33:04.931178	2026-02-19 15:52:23.301
16	+5531992004745	871681361	871681361	2026-02-19 15:52:48.104534	2026-02-19 15:52:48.104534
\.


--
-- Data for Name: web_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.web_sessions (id, user_id, token, expires_at, created_at, updated_at) FROM stdin;
09c4b83f-3bfe-4892-a17f-88eadd545b24	7096037854	df0255cfd9b27da4f789f29aae257c105d67b7095181e7f2	2026-03-21 15:31:14.827	2026-02-19 15:29:20.225827	2026-02-19 15:31:14.827
81a54a3f-dfaf-4192-9e3f-f22513984955	8425872990	df8848cb9d0093b6ded1e357075c30217040acf3ef345c03	2026-03-09 09:56:45.951	2026-02-07 02:04:20.264678	2026-02-07 09:56:45.951
e38aef8b-b260-49d7-a48e-fc1d748f1897	398791170	2899587747cc11d47b65ee72f79280f45307c1f24bc436e0	2026-03-15 20:56:21.945	2026-02-12 03:01:39.44796	2026-02-13 20:56:21.945
1c2757ac-4995-4db0-86f4-3b4a9c0495b6	1661337430	83b38dda9d470ae65bf27b6b38eb0d69a6d4da66325cd29e	2026-03-21 04:09:56.955	2026-02-17 17:35:33.414891	2026-02-19 04:09:56.955
054df7c9-fec3-4058-aeac-89e40902c8bf	871681361	ccdf6a1f643242e7a94311bd1fad7b857d3ebbc705f8b6b5	2026-03-21 18:08:11.159	2026-02-19 15:52:52.838863	2026-02-19 18:08:11.159
bbd47cac-2cdc-45b9-9e73-a16536b79161	398791170	ce1310fd6c115fed13fa347da9b63aee63ff8f69baa2df11	2026-03-21 21:41:57.332	2026-02-19 03:06:47.725297	2026-02-19 21:41:57.332
c9921e50-a31a-4a6e-839f-9e2374edde77	173289054	107cd6aaae6529a0af35d6e865bc7abcc03e861149cc5bde	2026-03-21 20:52:33.152	2026-02-07 20:59:14.615157	2026-02-19 20:52:33.152
e664fcf5-beb9-4b96-8535-4e6d9b3667c7	1661337430	77791e1a718d99fb7a4e906025e2cfacc26c905d7bd50b68	2026-03-19 23:59:50.852	2026-02-17 23:58:22.796199	2026-02-17 23:59:50.852
5dd594e7-f41d-4a3a-983c-0075933cb2bb	871681361	f16faf92d8c87ba1737684aecf12615260fa2d70f399b488	2026-03-21 20:57:41.895	2026-02-19 20:24:29.356982	2026-02-19 20:57:41.895
31022d32-582b-4981-bfb6-7046e1d5206b	398791170	1689cb4b3afe41867ef3aa8edee224874dbe84d356cff64e	2026-03-21 19:01:08.569	2026-02-19 02:30:46.81528	2026-02-19 19:01:08.569
6e8e627d-3b50-4c24-bfcb-7d60c1b935c0	7323873340	392f006f97d6e8bb64c745967666c97440f86510478afa75	2026-03-20 16:29:34.279	2026-02-12 20:26:17.092131	2026-02-18 16:29:34.279
f0ab8c23-e751-4e56-94ef-ca6a19a35e93	7323873340	3d060bf475002e973e219ad2578cf122e3ec234ff74717d8	2026-03-19 17:53:16.909	2026-02-14 00:10:02.197625	2026-02-17 17:53:16.909
15a4b1cb-1105-44ce-a294-3b22298d10d9	6673618605	4a52117a983ea37b2e122e59694190157226e55808a73b68	2026-03-21 16:24:04.236	2026-02-14 01:09:20.965696	2026-02-19 16:24:04.236
d683919c-3b5e-4ef6-9368-fbdb9baca190	1661337430	70f91cd66f81449c63363d5c5dce22ec03ed1f89196b5d6d	2026-03-21 21:01:20.151	2026-02-13 13:55:40.544299	2026-02-19 21:01:20.151
\.


--
-- Data for Name: worker_ports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_ports (user_id, port, created_at, updated_at) FROM stdin;
173289054	5000	2026-02-07 01:10:47.853336	2026-02-07 01:10:47.853336
8425872990	5001	2026-02-07 02:04:34.571929	2026-02-07 02:04:34.571929
398791170	5002	2026-02-07 02:07:35.055488	2026-02-07 02:07:35.055488
8532513170	5003	2026-02-07 03:25:26.058711	2026-02-07 03:25:26.058711
1661337430	5004	2026-02-12 04:56:50.199312	2026-02-12 04:56:50.199312
7323873340	5005	2026-02-12 20:26:42.62524	2026-02-12 20:26:42.62524
6673618605	5006	2026-02-14 01:30:05.983813	2026-02-14 01:30:05.983813
6895700442	5007	2026-02-19 15:39:34.546362	2026-02-19 15:39:34.546362
871681361	5008	2026-02-19 15:54:15.949517	2026-02-19 15:54:15.949517
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: -
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 20, true);


--
-- Name: active_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.active_groups_id_seq', 257, true);


--
-- Name: cielo_webhook_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cielo_webhook_events_id_seq', 1, true);


--
-- Name: coupons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.coupons_id_seq', 4, true);


--
-- Name: messages_enqueued_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.messages_enqueued_id_seq', 102513, true);


--
-- Name: messages_processed_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.messages_processed_id_seq', 205117, true);


--
-- Name: miles_programs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.miles_programs_id_seq', 25, true);


--
-- Name: otp_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.otp_codes_id_seq', 54, true);


--
-- Name: prompt_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.prompt_configs_id_seq', 1, true);


--
-- Name: subscription_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.subscription_payments_id_seq', 1, false);


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.subscription_plans_id_seq', 4, true);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.subscriptions_id_seq', 12, true);


--
-- Name: user_available_miles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_available_miles_id_seq', 1959, true);


--
-- Name: user_max_prices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_max_prices_id_seq', 718, true);


--
-- Name: user_price_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_price_entries_id_seq', 340, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 16, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: active_groups active_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_groups
    ADD CONSTRAINT active_groups_pkey PRIMARY KEY (id);


--
-- Name: active_groups active_groups_user_id_group_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_groups
    ADD CONSTRAINT active_groups_user_id_group_id_unique UNIQUE (user_id, group_id);


--
-- Name: bot_status bot_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_status
    ADD CONSTRAINT bot_status_pkey PRIMARY KEY (user_id);


--
-- Name: cielo_webhook_events cielo_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cielo_webhook_events
    ADD CONSTRAINT cielo_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_unique UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: messages_enqueued messages_enqueued_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages_enqueued
    ADD CONSTRAINT messages_enqueued_pkey PRIMARY KEY (id);


--
-- Name: messages_processed messages_processed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages_processed
    ADD CONSTRAINT messages_processed_pkey PRIMARY KEY (id);


--
-- Name: miles_programs miles_programs_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miles_programs
    ADD CONSTRAINT miles_programs_name_unique UNIQUE (name);


--
-- Name: miles_programs miles_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miles_programs
    ADD CONSTRAINT miles_programs_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: prompt_configs prompt_configs_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_configs
    ADD CONSTRAINT prompt_configs_key_unique UNIQUE (key);


--
-- Name: prompt_configs prompt_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_configs
    ADD CONSTRAINT prompt_configs_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (request_id);


--
-- Name: subscription_payments subscription_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_payments
    ADD CONSTRAINT subscription_payments_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_name_unique UNIQUE (name);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);


--
-- Name: user_available_miles user_available_miles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_available_miles
    ADD CONSTRAINT user_available_miles_pkey PRIMARY KEY (id);


--
-- Name: user_available_miles user_available_miles_user_program_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_available_miles
    ADD CONSTRAINT user_available_miles_user_program_unique UNIQUE (user_id, program_id);


--
-- Name: user_counter_offer_settings user_counter_offer_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_counter_offer_settings
    ADD CONSTRAINT user_counter_offer_settings_pkey PRIMARY KEY (user_id);


--
-- Name: user_max_prices user_max_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_max_prices
    ADD CONSTRAINT user_max_prices_pkey PRIMARY KEY (id);


--
-- Name: user_max_prices user_max_prices_user_program_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_max_prices
    ADD CONSTRAINT user_max_prices_user_program_unique UNIQUE (user_id, program_id);


--
-- Name: user_price_entries user_price_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_price_entries
    ADD CONSTRAINT user_price_entries_pkey PRIMARY KEY (id);


--
-- Name: user_price_entries user_price_entries_user_program_quantity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_price_entries
    ADD CONSTRAINT user_price_entries_user_program_quantity_unique UNIQUE (user_id, program_id, quantity);


--
-- Name: users users_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_unique UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_telegram_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_telegram_user_id_unique UNIQUE (telegram_user_id);


--
-- Name: web_sessions web_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_sessions
    ADD CONSTRAINT web_sessions_pkey PRIMARY KEY (id);


--
-- Name: web_sessions web_sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_sessions
    ADD CONSTRAINT web_sessions_token_unique UNIQUE (token);


--
-- Name: worker_ports worker_ports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_ports
    ADD CONSTRAINT worker_ports_pkey PRIMARY KEY (user_id);


--
-- Name: active_groups_user_id_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX active_groups_user_id_group_id_idx ON public.active_groups USING btree (user_id, group_id);


--
-- Name: active_groups_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX active_groups_user_id_idx ON public.active_groups USING btree (user_id);


--
-- Name: bot_status_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bot_status_user_id_idx ON public.bot_status USING btree (user_id);


--
-- Name: cielo_webhook_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cielo_webhook_events_created_at_idx ON public.cielo_webhook_events USING btree (created_at);


--
-- Name: cielo_webhook_events_payment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cielo_webhook_events_payment_id_idx ON public.cielo_webhook_events USING btree (payment_id);


--
-- Name: cielo_webhook_events_recurrent_payment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cielo_webhook_events_recurrent_payment_id_idx ON public.cielo_webhook_events USING btree (recurrent_payment_id);


--
-- Name: coupons_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupons_code_idx ON public.coupons USING btree (code);


--
-- Name: coupons_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupons_is_active_idx ON public.coupons USING btree (is_active);


--
-- Name: coupons_restricted_to_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupons_restricted_to_user_id_idx ON public.coupons USING btree (restricted_to_user_id);


--
-- Name: messages_enqueued_enqueued_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_enqueued_enqueued_at_idx ON public.messages_enqueued USING btree (enqueued_at);


--
-- Name: messages_enqueued_queue_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_enqueued_queue_name_idx ON public.messages_enqueued USING btree (queue_name);


--
-- Name: messages_enqueued_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_enqueued_user_id_idx ON public.messages_enqueued USING btree (user_id);


--
-- Name: messages_processed_processed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_processed_processed_at_idx ON public.messages_processed USING btree (processed_at);


--
-- Name: messages_processed_queue_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_processed_queue_name_idx ON public.messages_processed USING btree (queue_name);


--
-- Name: messages_processed_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_processed_status_idx ON public.messages_processed USING btree (status);


--
-- Name: messages_processed_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_processed_user_id_idx ON public.messages_processed USING btree (user_id);


--
-- Name: miles_programs_liminar_of_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX miles_programs_liminar_of_id_idx ON public.miles_programs USING btree (liminar_of_id);


--
-- Name: miles_programs_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX miles_programs_name_idx ON public.miles_programs USING btree (name);


--
-- Name: otp_codes_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX otp_codes_phone_idx ON public.otp_codes USING btree (phone);


--
-- Name: sessions_logged_in_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_logged_in_user_id_idx ON public.sessions USING btree (logged_in_user_id);


--
-- Name: sessions_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_state_idx ON public.sessions USING btree (state);


--
-- Name: sessions_telegram_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_telegram_user_id_idx ON public.sessions USING btree (telegram_user_id);


--
-- Name: subscription_payments_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_payments_created_at_idx ON public.subscription_payments USING btree (created_at);


--
-- Name: subscription_payments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_payments_status_idx ON public.subscription_payments USING btree (status);


--
-- Name: subscription_payments_subscription_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_payments_subscription_id_idx ON public.subscription_payments USING btree (subscription_id);


--
-- Name: subscription_plans_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_plans_is_active_idx ON public.subscription_plans USING btree (is_active);


--
-- Name: subscription_plans_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_plans_name_idx ON public.subscription_plans USING btree (name);


--
-- Name: subscriptions_current_period_end_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_current_period_end_idx ON public.subscriptions USING btree (current_period_end);


--
-- Name: subscriptions_plan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_plan_id_idx ON public.subscriptions USING btree (plan_id);


--
-- Name: subscriptions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_status_idx ON public.subscriptions USING btree (status);


--
-- Name: subscriptions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_user_id_idx ON public.subscriptions USING btree (user_id);


--
-- Name: user_available_miles_program_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_available_miles_program_id_idx ON public.user_available_miles USING btree (program_id);


--
-- Name: user_available_miles_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_available_miles_user_id_idx ON public.user_available_miles USING btree (user_id);


--
-- Name: user_max_prices_program_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_max_prices_program_id_idx ON public.user_max_prices USING btree (program_id);


--
-- Name: user_max_prices_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_max_prices_user_id_idx ON public.user_max_prices USING btree (user_id);


--
-- Name: user_price_entries_program_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_price_entries_program_id_idx ON public.user_price_entries USING btree (program_id);


--
-- Name: user_price_entries_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_price_entries_user_id_idx ON public.user_price_entries USING btree (user_id);


--
-- Name: users_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_phone_idx ON public.users USING btree (phone);


--
-- Name: users_telegram_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_telegram_user_id_idx ON public.users USING btree (telegram_user_id);


--
-- Name: web_sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_sessions_expires_at_idx ON public.web_sessions USING btree (expires_at);


--
-- Name: web_sessions_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_sessions_token_idx ON public.web_sessions USING btree (token);


--
-- Name: web_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_sessions_user_id_idx ON public.web_sessions USING btree (user_id);


--
-- PostgreSQL database dump complete
--

\unrestrict xsbHI6zQOWS1iDWRbjkIwaswh4X0l3yL2KlH81QC47YX83YTZat4hIeM1VF1uAY

