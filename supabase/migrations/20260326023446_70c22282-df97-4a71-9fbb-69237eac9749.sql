
-- Make vr-simulations bucket public so uploaded videos are playable
UPDATE storage.buckets SET public = true WHERE id = 'vr-simulations';
