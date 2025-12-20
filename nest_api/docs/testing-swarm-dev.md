# Testing Docker Swarm Implementation in Development

This guide explains how to test the `WorkerManagerSwarm` implementation in your development environment.

## Prerequisites

1. Docker installed and running
2. Docker Swarm mode initialized (can be done on a single machine)
3. Access to Docker socket (default: `/var/run/docker.sock`)

## Step 1: Initialize Docker Swarm Mode

Even on a single machine, you can initialize Swarm mode for testing:

```bash
# Initialize Swarm mode (if not already initialized)
docker swarm init

# Verify Swarm is active
docker info | grep Swarm
# Should show: Swarm: active
```

**Note:** If you get an error that Swarm is already initialized, you can either:
- Use the existing Swarm: `docker node ls` to verify
- Leave Swarm mode: `docker swarm leave --force` (then re-init if needed)

## Step 2: Create Required Volumes

Docker Swarm requires volumes to be created before services can use them. Unlike Docker Compose, Swarm doesn't auto-create volumes.

```bash
# Create a test volume for a user (replace USER_ID with actual user ID)
docker volume create tdlib-USER_ID

# Or create volumes for multiple test users
docker volume create tdlib-user1
docker volume create tdlib-user2
```

**Important:** The volume name must match the pattern `tdlib-{userId}` used in the code.

## Step 3: Ensure Worker Image Exists

Make sure your worker image is built and available:

```bash
# Build the worker image (adjust path/tag as needed)
docker build -t worker-test:latest ./tdlib_worker

# Verify image exists
docker images | grep worker-test
```

## Step 4: Set Environment Variable

Set the `WORKER_MANAGER_TYPE` environment variable to `swarm`:

```bash
# In your .env file or export before running
export WORKER_MANAGER_TYPE=swarm

# Or add to your .env file:
echo "WORKER_MANAGER_TYPE=swarm" >> .env
```

## Step 5: Ensure Docker Socket Access

The NestJS app needs access to the Docker socket. If running in a container, mount the socket:

```yaml
# In docker-compose.yml (if running nest_api in container)
services:
  nest_api:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

If running locally (not in container), dockerode will use `/var/run/docker.sock` by default.

## Step 6: Test the Implementation

### Start Your Application

```bash
# Start the NestJS app with Swarm mode
cd nest_api
WORKER_MANAGER_TYPE=swarm pnpm start:dev
```

### Verify Services Are Created

In another terminal:

```bash
# List all Swarm services
docker service ls

# Inspect a specific service
docker service inspect tdlib-USER_ID

# View service logs
docker service logs tdlib-USER_ID

# Check service tasks (containers)
docker service ps tdlib-USER_ID
```

### Test Worker Operations

1. **Create a worker** (via your API/application):
   ```bash
   # This will create a Swarm service
   curl -X POST http://localhost:3000/api/workers/USER_ID/start
   ```

2. **Check service status**:
   ```bash
   docker service ls | grep tdlib
   docker service ps tdlib-USER_ID
   ```

3. **Stop a worker**:
   ```bash
   # This will scale the service to 0 replicas
   curl -X POST http://localhost:3000/api/workers/USER_ID/stop
   ```

4. **Verify service scaled down**:
   ```bash
   docker service ps tdlib-USER_ID
   # Should show 0/1 replicas
   ```

## Step 7: Monitor and Debug

### View Service Logs

```bash
# Follow logs for a service
docker service logs -f tdlib-USER_ID

# View last 100 lines
docker service logs --tail 100 tdlib-USER_ID
```

### Check Service Health

```bash
# Inspect service details
docker service inspect tdlib-USER_ID --pretty

# Check running tasks
docker service ps tdlib-USER_ID --no-trunc
```

### Debug Service Issues

```bash
# If service fails to start, check events
docker service ps tdlib-USER_ID --no-trunc

# Check Docker events
docker events --filter service=tdlib-USER_ID

# Inspect the service configuration
docker service inspect tdlib-USER_ID | jq '.[0].Spec'
```

## Differences from Compose Mode

| Aspect | Compose Mode | Swarm Mode |
|--------|-------------|------------|
| **Volumes** | Auto-created | Must be pre-created |
| **Containers** | Direct containers | Services with tasks |
| **Ports** | Direct binding | Routing mesh (ingress) |
| **Scaling** | Manual | Built-in replica scaling |
| **Restart** | Container restart | Service replica management |

## Common Issues and Solutions

### Issue: "Volume not found"
**Solution:** Create the volume first:
```bash
docker volume create tdlib-USER_ID
```

### Issue: "Image not found"
**Solution:** Build or pull the image:
```bash
docker build -t worker-test:latest ./tdlib_worker
```

### Issue: "Swarm is not active"
**Solution:** Initialize Swarm:
```bash
docker swarm init
```

### Issue: "Permission denied" on Docker socket
**Solution:** Add user to docker group or use sudo:
```bash
sudo usermod -aG docker $USER
# Then logout and login again
```

### Issue: Service stuck in "pending" state
**Solution:** Check constraints and node availability:
```bash
docker service ps tdlib-USER_ID --no-trunc
docker node ls
```

## Switching Back to Compose Mode

To switch back to Compose mode for development:

```bash
# Remove WORKER_MANAGER_TYPE or set to 'compose'
export WORKER_MANAGER_TYPE=compose
# Or remove from .env file
```

## Cleanup

To clean up test services:

```bash
# Remove a service
docker service rm tdlib-USER_ID

# Remove all tdlib services
docker service ls | grep tdlib | awk '{print $1}' | xargs docker service rm

# Remove volumes (if needed)
docker volume rm tdlib-USER_ID
```

## Production Considerations

When deploying to production:

1. **Multi-node Swarm**: Set up multiple manager/worker nodes
2. **Volume Drivers**: Use appropriate volume drivers (e.g., NFS, cloud storage)
3. **Network**: Configure overlay networks for service communication
4. **Secrets**: Use Docker secrets for sensitive data instead of env files
5. **Resource Limits**: Set appropriate resource limits in TaskTemplate
6. **Update Strategy**: Configure UpdateConfig for zero-downtime deployments

## Quick Test Script

Create a simple test script to verify everything works:

```bash
#!/bin/bash
# test-swarm.sh

USER_ID="test-user-$(date +%s)"
echo "Testing with USER_ID: $USER_ID"

# Create volume
docker volume create tdlib-${USER_ID}

# Set environment
export WORKER_MANAGER_TYPE=swarm

# Start your app and test...
# (Your actual test commands here)

# Cleanup
docker service rm tdlib-${USER_ID} 2>/dev/null
docker volume rm tdlib-${USER_ID} 2>/dev/null
```

