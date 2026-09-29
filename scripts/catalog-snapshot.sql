-- Normalised catalog snapshot of application-owned objects, for drift comparison.
select 'col '||table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' def='||coalesce(column_default,'') from information_schema.columns where table_schema='public'
union all select 'con '||conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace
union all select 'idx '||indexname||' '||indexdef from pg_indexes where schemaname='public'
union all select 'pol '||tablename||'.'||policyname||' '||cmd||' '||array_to_string(roles,',')||' U:'||coalesce(qual,'')||' C:'||coalesce(with_check,'') from pg_policies where schemaname in ('public','storage')
union all select 'fn '||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') secdef='||p.prosecdef||' cfg='||coalesce(array_to_string(p.proconfig,','),'')||' md5='||md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname<>'rls_auto_enable'
union all select 'trg '||tgrelid::regclass||' '||tgname||' '||pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'auth.%' and tgrelid::regclass::text not like 'storage.%' and tgrelid::regclass::text not like 'cron.%' and tgrelid::regclass::text not like 'realtime.%'
union all select 'rls '||relname||' '||relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'
union all select 'grant '||table_name||' '||grantee||' '||privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')
order by 1;
