# /// script
# dependencies = [
#   "fastmcp",
# ]
# ///

from fastmcp import FastMCP
import subprocess
import os
import platform
from datetime import datetime

mcp = FastMCP("Local Terminal")

def get_context_str():
    return f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\nShell: {os.environ.get('SHELL', 'unknown')}\nMachine: {platform.platform()}"

@mcp.resource("system://context")
def get_system_context() -> str:
    """Returns current system context: Time, Shell, and Machine info."""
    return get_context_str()

@mcp.tool()
def run_command(command: str) -> str:
    """
    Runs a shell command in the terminal and returns the output.
    System info is available via the system://context resource.
    """
    try:
        # Using shell=True to allow complex commands (pipes, etc)
        # In a real app, you'd want more security, but this is for local dev
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        if result.stderr:
            output += f"\nSTDERR:\n{result.stderr}"
        return output.strip()
    except Exception as e:
        return f"Error executing command: {str(e)}"

if __name__ == "__main__":
    mcp.run(transport="stdio")
