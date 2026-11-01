delete from public.artists;
insert into public.artists (slug, name, field, bio, image) values
('elissa','إليسا','غناء','ملكة الإحساس، صوت لبناني صنع ذكريات أجيال بأغانٍ رومانسية خالدة.','elissa');
insert into public.challenges (artist_id, title, description, ends_at)
select id, 'ارسم لحظتك المفضلة', 'شارك رسمة أو تصميم مستوحى من أغنية تحبها لإليسا.', current_date + 14 from public.artists where slug='elissa';
insert into public.challenges (artist_id, title, description, ends_at)
select id, 'ترجمة للعالم', 'ساعد فانز من بلدان أخرى بترجمة كلمات الأغاني أو المقابلات.', current_date + 21 from public.artists where slug='elissa';
insert into public.group_projects (artist_id, title, description, goal)
select id, 'رسالة شكر جماعية', 'كل فان يكتب سطرًا، ونجمعها في رسالة واحدة.', 100 from public.artists where slug='elissa';
insert into public.group_projects (artist_id, title, description, goal)
select id, 'مبادرة توعية بالسرطان', 'مبادرة تطوعية للتوعية والدعم، مستوحاة من رسالة إليسا للأمل.', 50 from public.artists where slug='elissa';