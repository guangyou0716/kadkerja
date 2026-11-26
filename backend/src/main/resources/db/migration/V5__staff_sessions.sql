-- Goes up when an account is deactivated or its password changes: sessions signed in before that end.
alter table staff_user add column session_epoch integer default 0 not null;
