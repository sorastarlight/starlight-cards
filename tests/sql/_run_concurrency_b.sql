select set_config('starlight.allow_opening_recovery_tests', 'on', false);
select starlight_test.concurrency_same_request_session_b();
