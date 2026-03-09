# robot-model-js-client-demo
A karpfen engine demo with the execution engine running as a server and a visual minimal frontend in javascript and HTML

## Project Structure

- `webui.html` contains the single-page demo frontend
- `connector.js` contains all frontend networking code for communication with the karpfen runtime
- `cleaning_robot.kmeta` the metamodel file for this demo
- `cleaning_robot.kmodel` the world model (data model) for this demo
- `cleaning_robot.kstates` the state machine for this demo


## About this Demo

This projects provides an interactive demo for the `karpfen-runtime` model execution service. By runnign this demo, you get fimilar with all setup and interaction possibilities of the karpfen-runtime. Still, bevore using karpfen in your onw projects, we recommend reading all available karpfen documentation.

After starting the demo (see next section) you can open a HTML view (webui.html). This UI comprises of three parts. A setup panel on the upper left side where you are guided through the setup steps until the environment is running. A websocket log panel on the lower left side and the world model simulation view on the right side (centered).

The log and setup panels are explained in the step-wise instructions in the next section.

**For more information about the karpfen-engine, please consult their respective [documentation](https://github.com/karpfenproject/karpfen-runtime)**

### World-Model Visualization

The provided models (`cleaning_robot.kmeta|kmodel|kstates`) encode a world comprising a quadratic room with fixed dimensions. This room contains two round obstacles with fixed positions and a robot (turtle) which also has a round bounding box.
The robot can move around the room. The robot's data object therefore comprises its current position as a vector and its moving direction as a vector. 

The world model visualization shows this 2D scene graphically. It depicts the room as a simple square and the obstacles and the robot as differentlz colored circles. The robot's movement vector is depcited as a small arrow.

The statechart which is executed on the karpfen-server modifies the movement vector and position values of the turtle robot during its execution. This frontend subscribes to (observes) these values via karpfen-runtimes websocket interface to consistently update the provided visualization.

## Running the Demo

**Important! This repository needs to be cloned with the --recursive flag!**

### Prerequisites

This demo works with the karpfen-runtime server in a development setup, meaning that the server is executed on device and not encapsulated by docker or something similar.

Therefore, your system needs to fulfill the following requirements:
- Java 21+ as default java home in the PATH (`java --version` = 21.x)
- Python 3.12+ available in the PATH via `python`, `python3` or `py`

### Starting the Demo

The demo is started by executing `./run.sh` which contains all further setup.
The run.sh file will modify the application.conf in the karpfen-runtime with custom parameters. If you want to change the configuration, please do so in the run.sh.

After the run.sh has started the karpfen-runtime server, you can open the `webui.html` in your browser.
There, you can now execute the following actions in order (the webui ensures the order). You may observe the output of the runtime on the terminal meanwhile (stdout and stderr are propagated).

Some configurations in this demo-setup are specificly designed for the provided example models. So altough the application asks you to submit models manually, please only select the provided ones. If you know what you are doing, you can play with the statemachine model but without touching the data model or metamodel. Othervise this demo's visualizations may break.

1. Click *Create Execution Environment*. This requests a new environment in the runtime and returns an envKey which is now displayed.
2. Load the metamodel via the now visible *Load Metamodel* button. There you select the `cleaning_robot.kmeta` in the file picker. This action sends the metamodel to the runtime and registers it in the created environment.
3. Load the model via the now visible *Load Model* button. There, you select the `cleaning_robot.kmodel` in the file picker. This action sends the model to the runtime.
4. Load the statemachine via the now visible *Load Statemachine* button. There, you select the `cleaning_robot.kstates` in the file picker. A subsequent dialogue will ask you to which model element you want to attach the statechart to. The predefined option is `turtle`. Keept this option and submit the statemachine by clicking next.
5. (Automated) after you submitted the satechart, the ui will atomatically register an observer on the `position` vector of the turtle robot and its movement vector. This subscription is hard-coded and specific to the demo model.
6. After everything is setup, you can connect to the runtime websocket for live data. Doing so gives you a session key. After connecting successfully, a green status badge appears.
7. Now, you can start the statemachine via the visible `run` button next to it. This also activate a status log view which display any incoming websocket messages asychronously.
8. The statemachine should now be running in the runtime. However it is designed in such a way that it requires a dedicated start event to go from the initial state into a self-sufficient run loop. You can trigger the prepared event by clicking on the now available `trigger statemachine initial event` action button.
9. The statemachine now runs until you send a `kill engine` message via the respective action button. While the statemachine is running, you can observe the following behaviour:
    1. In the websocket log, you see arriving data updates from the observed data objects (turtle position)
    2. In the simulation screen, you see the discretely moving turle based on the updated position values from the websocket.
