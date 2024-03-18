import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { Value } from "../../src/types";
import { delay } from "../../src/utils";


type NodeState = {
  killed: boolean;
  x: Value | null;
  decided: boolean | null;
  k: number | null;
};

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  let currentState: NodeState = {
    killed: false,
    x: initialValue,
    decided: null,
    k: null,
  };

  app.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  app.get("/start", async (req, res) => {
    while (!nodesAreReady()) {
      await delay(100);
    }
    if (!isFaulty) {
      currentState.k = 1;
      currentState.x = initialValue;
      currentState.decided = false;
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${3000 + i}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            k: currentState.k,
            x: currentState.x,
            type: "2P",
          }),
        });
      }
    } else {
      currentState.decided = null;
      currentState.x = null;
      currentState.k = null;
    }
    res.status(200).send("success");
  });

  app.post("/message", async (req: Request<any, any, any, any>, res: Response<any>) => {
    let { k, x, type } = req.body;
    if (!currentState.killed && !isFaulty) {
      if (type == "2P") {
        if (!proposals.has(k)) proposals.set(k, []);
        proposals.get(k)!.push(x);
        const proposal = proposals.get(k)!;
        if (proposal.length >= N - F) {
          const CN = proposal.filter((x) => x == 0).length;
          const CY = proposal.filter((x) => x == 1).length;
          x = CN > N / 2 ? 0 : CY > N / 2 ? 1 : "?";
          for (let i = 0; i < N; i++) {
            fetch(`http://localhost:${3000 + i}/message`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ k, x, type: "2V" }),
            });
          }
        }
      } else if (type == "2V") {
        if (!votes.has(k)) votes.set(k, []);
        votes.get(k)!.push(x);
        const vote = votes.get(k)!;
        if (vote.length >= N - F) {
          const CN = vote.filter((x) => x == 0).length;
          const CY = vote.filter((x) => x == 1).length;
          if (CN >= F + 1) {
            currentState.x = 0;
            currentState.decided = true;
          } else if (CY >= F + 1) {
            currentState.x = 1;
            currentState.decided = true;
          } else {
            currentState.x = CN + CY > 0 && CN > CY ? 0 : CN + CY > 0 && CN < CY ? 1 : Math.random() > 0.5 ? 0 : 1;
            currentState.k = k + 1;
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${3000 + i}/message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ k: currentState.k, x: currentState.x, type: "2P" }),
              });
            }
          }
        }
      }
    }
    res.status(200).send("success");
  });

  app.get("/stop", async (req, res) => {
    currentState.killed = true;
    currentState.x = null;
    currentState.decided = null;
    currentState.k = null;
    res.send("Node stopped");
  });

  app.get("/getState", (req, res) => {
    if (isFaulty) {
      res.send({
        killed: currentState.killed,
        x: null,
        decided: null,
        k: null,
      });
    } else {
      res.send(currentState);
    }
  });

  const server = app.listen(3000 + nodeId, () => {
    console.log(`Node ${nodeId} is listening on port ${3000 + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
