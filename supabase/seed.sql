-- Synthetic departments/categories only. Account provisioning is explicit and credential-free.
insert into public.departments(department_id,name,active) values('0e601277-1784-5bfa-884f-942326d527c6','Engineering',true) on conflict(department_id) do nothing;
insert into public.departments(department_id,name,active) values('d7e4c63b-396f-5d67-820a-88cfcca0d650','Science',true) on conflict(department_id) do nothing;
insert into public.categories(category_id,parent_category_id,name) values('7ac508b5-f1f1-5963-9048-dfe8dcf8661a',null,'Monitors') on conflict(category_id) do nothing;
insert into public.categories(category_id,parent_category_id,name) values('91421637-c467-58e9-ae33-b3ed1e5bd969',null,'Chairs') on conflict(category_id) do nothing;
insert into public.categories(category_id,parent_category_id,name) values('66b9aef5-f952-58a8-b819-702b25b9d494',null,'Projectors') on conflict(category_id) do nothing;
