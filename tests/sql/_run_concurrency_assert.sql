select set_config('starlight.allow_opening_recovery_tests', 'on', false);
select label,
       result->>'claimId' as claim_id,
       result->>'idempotentReplay' as replay,
       jsonb_array_length(coalesce(result->'cards', '[]'::jsonb)) as card_count,
       qty_before,
       qty_after
from starlight_test.concurrency_probe
order by label;
select starlight_test.assert_concurrency_same_request_outcome();
