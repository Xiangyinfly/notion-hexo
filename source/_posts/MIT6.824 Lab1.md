---
categories: 基础架构
tags:
  - MIT
  - 后端
description: ''
permalink: ''
title: MIT6.824 Lab1
cover: /images/ab6231a3d2f775538d50989cdb1f8a9d.png
date: '2025-01-01 17:42:00'
updated: '2025-01-01 17:48:00'
---

# 简介


实验的要求简单来说就是根据MapReduce论文，用GO实现一个简单的MapReduce流程，对给定数据进行处理并通过测试。


# 环境


### GO版本


实验默认是使用的1.15，也有很多推荐1.16的（和1.15差别不大，且可以进行调试）


因为电脑上安装过1.22版本，索性就使用1.22版本，就Lab1而言没出现致命的问题


### 拉取实验


使用如下命令拉取实验


```shell
git clone git://g.csail.mit.edu/6.824-golabs-2022 6.824
```


# 实验前置理解


## 包


在Lab1中，我们只需要关注三个包下的内容

- `mr`
	- 我们主要在这个包下的三个文件内来实现代码。`coordinator.go`中来实现协调者的相关代码，`worker.go`中来实现工作节点的相关代码，rpc.go中来实现和节点通信相关的定义和逻辑。
- `mrapps`
	- 这个文件夹下包含着每种测试要传入的map和reduce函数的定义。这些.go文件要被构建为.so文件
- `main`
	- 这个文件夹下包含着启动worker和coordinator的入口函数的文件：`mrworker.go`和`mrcoordinator.go`
	- 一系列`pg*.txt`文件是测试数据
	- `test-mr.sh`文件是最终测试的运行脚本

## 已给代码的理解


基本上都是关于rpc的


### Coordinator


开启rpc server


```go
// start a thread that listens for RPCs from worker.go
func (c *Coordinator) server() {
	rpc.Register(c)
	rpc.HandleHTTP()
	//l, e := net.Listen("tcp", ":1234")
	sockname := coordinatorSock()
	os.Remove(sockname)
	l, e := net.Listen("unix", sockname)
	if e != nil {
		log.Fatal("listen error:", e)
	}
	go http.Serve(l, nil)
}
```


### Worker


发送rpc请求


```go
// send an RPC request to the coordinator, wait for the response.
// usually returns true.
// returns false if something goes wrong.
func call(rpcname string, args interface{}, reply interface{}) bool {
	// c, err := rpc.DialHTTP("tcp", "127.0.0.1"+":1234")
	sockname := coordinatorSock()
	c, err := rpc.DialHTTP("unix", sockname)
	if err != nil {
		log.Fatal("dialing:", err)
	}
	defer c.Close()

	err = c.Call(rpcname, args, reply)
	if err == nil {
		return true
	}

	fmt.Println(err)
	return false
}
```


获得hash值


```go
// use ihash(key) % NReduce to choose the reduce
// task number for each KeyValue emitted by Map.
func ihash(key string) int {
	h := fnv.New32a()
	h.Write([]byte(key))
	return int(h.Sum32() & 0x7fffffff)
}
```


# 实验思路


## Task


Task就是worker需要完成的任务，即一个map过程或一个reduce过程


每一个Task都会

- 维护一个自增id用做唯一标识
- 维护一个数组作为任务的输入
- 维护一个任务类型，类型分为Map或Reduce
- 维护reducer的数量

Task由coordinate管理和分配，Coordinator会维护一个属性TaskManager来管理所有的Task


Task只有两个状态，即完成和未完成。Task的状态只有Coordinator的TaskManager知道，而对Worker是无状态的，仅仅为一个任务。


```go
type Task struct {
	// 任务id
	TaskId int
	// 任务输入，Map就是文件名，Reduce就是文件名数组
	Input []string
	// 任务类型
	TaskType Type
	// Reducer的个数
	ReducerNum int
}

type Type int

const (
	Map Type = iota
	Reduce
)
```


## Coordinator


Coordinator是系统中的协调者，负责协调整个执行流程，如任务的生成和分配，任务的监控等


Coordinator维护了

- 一个字符串数组，会传入需要处理的文件名称，是系统的输入
- 一个Stage，维护着整个系统执行的阶段，分为init，mapping，reducing和done
- 两个channel，分别为map task和reduce task的channel
- 一个TaskManager，用来管理Task的元信息（执行状态、开始执行时间、是否完成）和TaskId的自增的分配
- 维护reducer的数量

Coordinator主要需要实现

- 自身的初始化
- map task和reduce task的生成和分配
- Task信息管理的相关方法，例如将Task纳入TaskManager管理
- 由于只有Coordinator维护Task的状态，所以需要实现Task状态的转换和判定方法
- 系统执行阶段的转换
- Task监控的相关方法

```go
type Coordinator struct {
	files []string
	// 执行阶段
	GlobalStage Stage
	// map阶段任务的channel
	MapTaskChan    chan *Task
	ReduceTaskChan chan *Task
	// 管理task
	TaskManager TaskManager
	// reducer的个数
	ReducerNum int
}
type Stage int

const (
	Init Stage = iota
	Mapping
	Reducing
	Done
)

type TaskManager struct {
  // 用于记录当前已有的Task的id的最大值
	idLimit int
	// 记录Task元信息的map
	TaskMap map[int]*TaskMetaInfo
}
type TaskMetaInfo struct {
  // Task地址
	TaskAddr  *Task
	// 是否完成
	IsDone    bool
	// 开始时间
	StartTime time.Time
}
```


## Worker


Worker是系统中负责干活的，具体实现了map和reduce的流程，逻辑相对简单一些


Worker主要需要实现

- 向Coordinator索要任务
- 完成任务，进行map或reduce的处理
- 告诉Coordinator任务完成的消息

Worker对Coordinator也是无状态的。Worker会不断循环来向Coordinator索要任务，如果没有任务就适当休眠并继续索要；如果有任务就去完成，完成后发送完成信息，然后继续索要。


## 其他

- Worker和Coordinator之间的通信使用RPC，在实验代码中有相关例子。
- 并发控制使用加锁的策略，在`coordinator.go`中维护一个

	```go
	var (
		mu sync.Mutex
	)
	```


	由于所有可能的共享访问的变量都在Coordinator中维护，所以涉及到读写Coordinator的方法我们都进行加锁

- 关于map和reduce对文件处理的具体逻辑此处不做详细解释，本文主要从架构上进行阐释

# 代码实现


## Worker


首先来实现Worker最主要的方法`Worker`


```go
func Worker(mapf func(string, string) []KeyValue, reducef func(string, []string) string) {
	var IsDone bool
	args := ""
	for {
		call("Coordinator.Done", &args, &IsDone)
		if IsDone {
			break
		}

		task := pullTask()
		// 如果没有任务，就休眠一秒，避免cpu高占用
		if len(task.Input) == 0 {
			time.Sleep(time.Second)
			continue
		}

		switch task.TaskType {
		case Map:
			reply := Task{}
			doMap(mapf, &task)
			call("Coordinator.MarkTaskDone", &task, &reply)
		case Reduce:
			reply := Task{}
			doReduce(reducef, &task)
			call("Coordinator.MarkTaskDone", &task, &reply)
		}
	}

}
```


函数的主体是一个for循环，由`IsDone`来控制。每次循环之前，Worker都会向Coordinator发送rpc请求，访问COordinator的`Done`方法，询问系统的全局阶段是否已经完成。如果完成就结束循环，Worker下线；如果未完成就继续循环。


然后Worker通过`pullTask`向Coordinator索要任务，之后根据任务类型来执行相应的操作。任务执行成功后会使用rpc通知Coordinator该任务已经完成。


注意，如果没有任务（没有任务即`pullTask`得到的任务为空，我们使用`Task.Input` 数组长度为0来判别）就休眠一秒再循环，否则一直循环会**出现CPU持续高占用**


如果不去判断空任务，就会在`doMap`中出现空指针，因为空的任务默认初始化TaskType为0，即Map，所以就会进入`doMap`方法


然后就是`pullTask`


```go
func pullTask() Task {
	args := ""
	task := Task{}
	ok := call("Coordinator.PushTask", &args, &task)
	if !ok {
		log.Fatalln("拉取任务失败")
	}
	return task
}
```


rpc调用Coordinator的`PushTask`方法


最后就是map和reduce具体的实现逻辑


```go

type SortedKey []KeyValue

// Len 重写len,swap,less才能排序
func (k SortedKey) Len() int           { return len(k) }
func (k SortedKey) Swap(i, j int)      { k[i], k[j] = k[j], k[i] }
func (k SortedKey) Less(i, j int) bool { return k[i].Key < k[j].Key }


func doMap(mapf func(string, string) []KeyValue, response *Task) {
	var intermediate []KeyValue
	filename := response.Input[0]

	file, err := os.Open(filename)
	if err != nil {
		log.Fatalf("cannot open %v", filename)
	}

	content, err := ioutil.ReadAll(file)
	if err != nil {
		log.Fatalf("cannot read %v", filename)
	}
	file.Close()

	intermediate = mapf(filename, string(content))

	rn := response.ReducerNum
	HashedKV := make([][]KeyValue, rn)
	for _, kv := range intermediate {
		HashedKV[ihash(kv.Key)%rn] = append(HashedKV[ihash(kv.Key)%rn], kv)
	}
	for i := 0; i < rn; i++ {
		oname := "mr-tmp-" + strconv.Itoa(response.TaskId) + "-" + strconv.Itoa(i)
		ofile, _ := os.Create(oname)
		enc := json.NewEncoder(ofile)
		for _, kv := range HashedKV[i] {
			enc.Encode(kv)
		}
		ofile.Close()
	}
}

func doReduce(reducef func(string, []string) string, response *Task) {
	reduceFileNum := response.TaskId
	intermediate := shuffle(response.Input)
	dir, _ := os.Getwd()
	tempFile, err := ioutil.TempFile(dir, "mr-tmp-*")
	if err != nil {
		log.Fatal("Failed to create temp file", err)
	}
	i := 0
	for i < len(intermediate) {
		j := i + 1
		for j < len(intermediate) && intermediate[j].Key == intermediate[i].Key {
			j++
		}
		var values []string
		for k := i; k < j; k++ {
			values = append(values, intermediate[k].Value)
		}
		output := reducef(intermediate[i].Key, values)
		fmt.Fprintf(tempFile, "%v %v\n", intermediate[i].Key, output)
		i = j
	}
	tempFile.Close()
	fn := fmt.Sprintf("mr-out-%d", reduceFileNum)
	os.Rename(tempFile.Name(), fn)
}

func shuffle(files []string) []KeyValue {
	var kva []KeyValue
	for _, filepath := range files {
		file, _ := os.Open(filepath)
		dec := json.NewDecoder(file)
		for {
			var kv KeyValue
			if err := dec.Decode(&kv); err != nil {
				break
			}
			kva = append(kva, kv)
		}
		file.Close()
	}
	sort.Sort(SortedKey(kva))
	return kva
}
```


这部分逻辑不难理解，不再赘述


最后也要修改一下`mrworker.go` 中的`main`方法，否则无法测试


```go
func main() {
	// if len(os.Args) != 2 {
	// 	fmt.Fprintf(os.Stderr, "Usage: mrworker xxx.so\n")
	// 	os.Exit(1)
	// }

	mapf, reducef := loadPlugin(os.Args[1])

	mr.Worker(mapf, reducef)
}
```


## Coordinator


首先是`Done`方法，这也是实验中给我们准备的方法。但是为了程序需要，我对`Done`方法修改了一下以满足rpc对要求。


```go
func (c *Coordinator) Done(args *string, IsDone *bool) error {
	mu.Lock()
	defer mu.Unlock()
	stage := c.GlobalStage
	*IsDone = stage == Done
	return nil
}
```


逻辑很简单，就是加锁后检查GlobalStage是否为Done


因此，`mrcoordinator.go`中调用`Done`的部分也要修改


```go
func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: mrcoordinator inputfiles...\n")
		os.Exit(1)
	}

	m := mr.MakeCoordinator(os.Args[1:], 10)

	for {
		var IsDone bool
		args := ""
		m.Done(&args, &IsDone)
		if IsDone {
			break
		}
		time.Sleep(time.Second)
	}

	time.Sleep(time.Second)
}
```


然后就是Coordinator的初始化方法_`MakeCoordinator`_


```go
func MakeCoordinator(files []string, nReduce int) *Coordinator {
	c := Coordinator{
		files:          files,
		GlobalStage:    Init,
		ReducerNum:     nReduce,
		MapTaskChan:    make(chan *Task, len(files)),
		ReduceTaskChan: make(chan *Task, nReduce),
		TaskManager: TaskManager{
			TaskMap: make(map[int]*TaskMetaInfo, len(files)+nReduce),
		},
	}

	c.generateMapTask(files)
	c.server()
	go c.CrashWatcher()
	return &c
}
```


我们首先初始化一个Coordinator，然后生成所有的map task，启动与Worker进行rpc通信的server，最后开启一个go程用来监控Task


生成map task的方法`generateMapTask`


```go
func (c *Coordinator) generateMapTask(files []string) {
	c.GlobalStage = Mapping
	for _, file := range files {
		taskId := c.generateTaskId()
		task := Task{
			TaskId:     taskId,
			Input:      []string{file},
			TaskType:   Map,
			ReducerNum: c.ReducerNum,
		}

		c.MapTaskChan <- &task
		c.TaskManager.addTask(&task)

		log.Println(task, "生成")
	}
}
```


这里我们遍历所有文件生成Task，然后将Task放入channel


然后调用`generateTaskId`生成自增且唯一的TaskId


```go
func (c *Coordinator) generateTaskId() int {
	id := &c.TaskManager.idLimit
	*id++
	return *id
}
```


最后调用`addTask`，将Task纳入TaskManager管理


```go
func (t *TaskManager) addTask(task *Task) {
	taskMetaInfo := TaskMetaInfo{
		TaskAddr: task,
		IsDone:   false,
	}
	id := task.TaskId
	t.TaskMap[id] = &taskMetaInfo
}
```


同理，我们照猫画虎可以写出生成reduce task的方法


```go
func (c *Coordinator) generateReduceTask() {
	for i := 0; i < c.ReducerNum; i++ {
		taskId := c.generateTaskId()
		task := Task{
			TaskId:   taskId,
			TaskType: Reduce,
			Input:    selectReduceName(i),
		}

		c.ReduceTaskChan <- &task
		c.TaskManager.addTask(&task)

		log.Println(task, "生成")
	}
}
```


接下来是重点方法_`PushTask`_，负责将Task推送至Worker


```go
func (c *Coordinator) PushTask(args *string, task *Task) error {
	mu.Lock()
	defer mu.Unlock()

	stage := c.GlobalStage
	switch stage {
	case Mapping:
		{
			if len(c.MapTaskChan) > 0 {
				*task = *<-c.MapTaskChan
				c.TaskManager.TaskMap[task.TaskId].StartTime = time.Now()

			} else {
				// 这里不设置也可以 因为默认是0 即Map
				task.TaskType = Map
				if c.TaskManager.checkMapDone() {
					c.nextStage()
				}
			}

		}
	case Reducing:
		{
			if len(c.ReduceTaskChan) > 0 {
				*task = *<-c.ReduceTaskChan
				c.TaskManager.TaskMap[task.TaskId].StartTime = time.Now()
			} else {
				task.TaskType = Reduce
				if c.TaskManager.checkReduceDone() {
					c.nextStage()
				}
			}
		}
	case Done:

	default:
		panic("非法的阶段！无法分配任务")
	}
	return nil
}
```


我们根据GlobalStage处在什么阶段来取出Task并进行分配。


当channel有任务的时候，我们就取出任务，并在TaskManager中设置开始时间，开始计时；如果channel中没有任务，就去判断一下是否此阶段的所有任务都做完了，准备进入下一个阶段


如果没有任务，不难发现Coordinator会给Worker一个空任务。由于我们在Worker中通过Task.Input是否为空来优先过滤掉空任务，所以else中其实没有必要设置TaskType


然后是判断map或reduce阶段是否已经完成的两个方法`checkXxxDone`


```go
func (t *TaskManager) checkMapDone() bool {
	for _, v := range t.TaskMap {
		if v.TaskAddr.TaskType == Map {
			if !v.IsDone {
				return false
			}
		}
	}
	return true
}

func (t *TaskManager) checkReduceDone() bool {
	for _, v := range t.TaskMap {
		if v.TaskAddr.TaskType == Reduce {
			if !v.IsDone {
				return false
			}
		}
	}
	return true
}
```


逻辑很简单，就是遍历所有指定类型的Task，如果全都完成就意味着此阶段完成


然后是进入下一个阶段的方法`nextStage`


```go
func (c *Coordinator) nextStage() {
	if c.GlobalStage == Mapping {
		c.GlobalStage = Reducing
		c.generateReduceTask()
	} else if c.GlobalStage == Reducing {
		c.GlobalStage = Done
	}

}
```


将GlobalStage设置为Reducing的时候同时要调用`generateReduceTask`，生成Reduce任务


接下来是标记Task完成的方法_`MarkTaskDone`_，该方法也是Worker通过rpc调用的


```go
func (c *Coordinator) MarkTaskDone(task *Task, reply *Task) error {
	mu.Lock()
	defer mu.Unlock()
	if len(task.Input) == 0 {
		return nil
	}
	c.TaskManager.TaskMap[task.TaskId].IsDone = true
	return nil
}
```


即将对应的Task的设置为已完成


最后是Task监控方法`CrashWatcher`，也是为了通过crash测试而实现的Task超时后重新分配执行机制


```go
func (c *Coordinator) CrashWatcher() {
	for {
		time.Sleep(2 * time.Second)
		mu.Lock()
		if c.GlobalStage == Done {
			mu.Unlock()
			break
		}
		for _, v := range c.TaskManager.TaskMap {
			if !v.IsDone && time.Since(v.StartTime) > 9*time.Second && !v.StartTime.IsZero() {
				fmt.Println(v.TaskAddr.TaskId, time.Since(v.StartTime), v.TaskAddr.Input, v.TaskAddr.TaskType)
				switch v.TaskAddr.TaskType {
				case Map:
					c.MapTaskChan <- v.TaskAddr
				case Reduce:
					c.ReduceTaskChan <- v.TaskAddr
				}
			}
		}
		mu.Unlock()
	}
}
```


主体是一个无限for循环


设置休眠两秒的原因是该方法需要获取锁`mu`，如果不休眠该go程会连续不断地获取锁，导致其他线程获取不到锁，程序会阻塞住


然后设置循环出口，如果GlobalStage为Done就解锁然后break/return


如果不为Done，就遍历所有Task，找到超时的Task重新放入对应的channel中，等待重新分配


注意，这里的判断条件为三个，缺一不可：

- `!v.IsDone`
	- Task必须是未完成的
- `time.Since(v.StartTime) > 9*time.Second`
	- Task的执行时间大于9s判断为超时
- `!v.StartTime.IsZero()`
	- Task的开始时间不能为默认0值，这意味着Task必须被分配过，不能是未分配的任务
	- time.Time的默认0值为`0001-01-01 00:00:00 +0000 UTC`

		如果没有此判断，未分配的Task都将作为超时Task被再次分配，对于普通测试无影响，但是对于jobcount的测试会一直fail


# 测试


如果按照以上代码，测试是可以全部通过的


```text
*** Starting wc test.
2024/08/14 09:25:40 {1 [../pg-being_ernest.txt] 0 10} 生成
2024/08/14 09:25:40 {2 [../pg-dorian_gray.txt] 0 10} 生成
2024/08/14 09:25:40 {3 [../pg-frankenstein.txt] 0 10} 生成
2024/08/14 09:25:40 {4 [../pg-grimm.txt] 0 10} 生成
2024/08/14 09:25:40 {5 [../pg-huckleberry_finn.txt] 0 10} 生成
2024/08/14 09:25:40 {6 [../pg-metamorphosis.txt] 0 10} 生成
2024/08/14 09:25:40 {7 [../pg-sherlock_holmes.txt] 0 10} 生成
2024/08/14 09:25:40 {8 [../pg-tom_sawyer.txt] 0 10} 生成
2024/08/14 09:25:42 {9 [mr-tmp-1-0 mr-tmp-2-0 mr-tmp-3-0 mr-tmp-4-0 mr-tmp-5-0 mr-tmp-6-0 mr-tmp-7-0 mr-tmp-8-0] 1 0} 生成
2024/08/14 09:25:42 {10 [mr-tmp-1-1 mr-tmp-2-1 mr-tmp-3-1 mr-tmp-4-1 mr-tmp-5-1 mr-tmp-6-1 mr-tmp-7-1 mr-tmp-8-1] 1 0} 生成
2024/08/14 09:25:42 {11 [mr-tmp-1-2 mr-tmp-2-2 mr-tmp-3-2 mr-tmp-4-2 mr-tmp-5-2 mr-tmp-6-2 mr-tmp-7-2 mr-tmp-8-2] 1 0} 生成
2024/08/14 09:25:42 {12 [mr-tmp-1-3 mr-tmp-2-3 mr-tmp-3-3 mr-tmp-4-3 mr-tmp-5-3 mr-tmp-6-3 mr-tmp-7-3 mr-tmp-8-3] 1 0} 生成
2024/08/14 09:25:42 {13 [mr-tmp-1-4 mr-tmp-2-4 mr-tmp-3-4 mr-tmp-4-4 mr-tmp-5-4 mr-tmp-6-4 mr-tmp-7-4 mr-tmp-8-4] 1 0} 生成
2024/08/14 09:25:42 {14 [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1 0} 生成
2024/08/14 09:25:42 {15 [mr-tmp-1-6 mr-tmp-2-6 mr-tmp-3-6 mr-tmp-4-6 mr-tmp-5-6 mr-tmp-6-6 mr-tmp-7-6 mr-tmp-8-6] 1 0} 生成
2024/08/14 09:25:42 {16 [mr-tmp-1-7 mr-tmp-2-7 mr-tmp-3-7 mr-tmp-4-7 mr-tmp-5-7 mr-tmp-6-7 mr-tmp-7-7 mr-tmp-8-7] 1 0} 生成
2024/08/14 09:25:42 {17 [mr-tmp-1-8 mr-tmp-2-8 mr-tmp-3-8 mr-tmp-4-8 mr-tmp-5-8 mr-tmp-6-8 mr-tmp-7-8 mr-tmp-8-8] 1 0} 生成
2024/08/14 09:25:42 {18 [mr-tmp-1-9 mr-tmp-2-9 mr-tmp-3-9 mr-tmp-4-9 mr-tmp-5-9 mr-tmp-6-9 mr-tmp-7-9 mr-tmp-8-9] 1 0} 生成
--- wc test: PASS
*** Starting indexer test.
2024/08/14 09:25:49 {1 [../pg-being_ernest.txt] 0 10} 生成
2024/08/14 09:25:49 {2 [../pg-dorian_gray.txt] 0 10} 生成
2024/08/14 09:25:49 {3 [../pg-frankenstein.txt] 0 10} 生成
2024/08/14 09:25:49 {4 [../pg-grimm.txt] 0 10} 生成
2024/08/14 09:25:49 {5 [../pg-huckleberry_finn.txt] 0 10} 生成
2024/08/14 09:25:49 {6 [../pg-metamorphosis.txt] 0 10} 生成
2024/08/14 09:25:49 {7 [../pg-sherlock_holmes.txt] 0 10} 生成
2024/08/14 09:25:49 {8 [../pg-tom_sawyer.txt] 0 10} 生成
2024/08/14 09:25:50 {9 [mr-tmp-1-0 mr-tmp-2-0 mr-tmp-3-0 mr-tmp-4-0 mr-tmp-5-0 mr-tmp-6-0 mr-tmp-7-0 mr-tmp-8-0] 1 0} 生成
2024/08/14 09:25:50 {10 [mr-tmp-1-1 mr-tmp-2-1 mr-tmp-3-1 mr-tmp-4-1 mr-tmp-5-1 mr-tmp-6-1 mr-tmp-7-1 mr-tmp-8-1] 1 0} 生成
2024/08/14 09:25:50 {11 [mr-tmp-1-2 mr-tmp-2-2 mr-tmp-3-2 mr-tmp-4-2 mr-tmp-5-2 mr-tmp-6-2 mr-tmp-7-2 mr-tmp-8-2] 1 0} 生成
2024/08/14 09:25:50 {12 [mr-tmp-1-3 mr-tmp-2-3 mr-tmp-3-3 mr-tmp-4-3 mr-tmp-5-3 mr-tmp-6-3 mr-tmp-7-3 mr-tmp-8-3] 1 0} 生成
2024/08/14 09:25:50 {13 [mr-tmp-1-4 mr-tmp-2-4 mr-tmp-3-4 mr-tmp-4-4 mr-tmp-5-4 mr-tmp-6-4 mr-tmp-7-4 mr-tmp-8-4] 1 0} 生成
2024/08/14 09:25:50 {14 [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1 0} 生成
2024/08/14 09:25:50 {15 [mr-tmp-1-6 mr-tmp-2-6 mr-tmp-3-6 mr-tmp-4-6 mr-tmp-5-6 mr-tmp-6-6 mr-tmp-7-6 mr-tmp-8-6] 1 0} 生成
2024/08/14 09:25:50 {16 [mr-tmp-1-7 mr-tmp-2-7 mr-tmp-3-7 mr-tmp-4-7 mr-tmp-5-7 mr-tmp-6-7 mr-tmp-7-7 mr-tmp-8-7] 1 0} 生成
2024/08/14 09:25:50 {17 [mr-tmp-1-8 mr-tmp-2-8 mr-tmp-3-8 mr-tmp-4-8 mr-tmp-5-8 mr-tmp-6-8 mr-tmp-7-8 mr-tmp-8-8] 1 0} 生成
2024/08/14 09:25:50 {18 [mr-tmp-1-9 mr-tmp-2-9 mr-tmp-3-9 mr-tmp-4-9 mr-tmp-5-9 mr-tmp-6-9 mr-tmp-7-9 mr-tmp-8-9] 1 0} 生成
--- indexer test: PASS
*** Starting map parallelism test.
2024/08/14 09:25:54 {1 [../pg-being_ernest.txt] 0 10} 生成
2024/08/14 09:25:54 {2 [../pg-dorian_gray.txt] 0 10} 生成
2024/08/14 09:25:54 {3 [../pg-frankenstein.txt] 0 10} 生成
2024/08/14 09:25:54 {4 [../pg-grimm.txt] 0 10} 生成
2024/08/14 09:25:54 {5 [../pg-huckleberry_finn.txt] 0 10} 生成
2024/08/14 09:25:54 {6 [../pg-metamorphosis.txt] 0 10} 生成
2024/08/14 09:25:54 {7 [../pg-sherlock_holmes.txt] 0 10} 生成
2024/08/14 09:25:54 {8 [../pg-tom_sawyer.txt] 0 10} 生成
2024/08/14 09:25:59 {9 [mr-tmp-1-0 mr-tmp-2-0 mr-tmp-3-0 mr-tmp-4-0 mr-tmp-5-0 mr-tmp-6-0 mr-tmp-7-0 mr-tmp-8-0] 1 0} 生成
2024/08/14 09:25:59 {10 [mr-tmp-1-1 mr-tmp-2-1 mr-tmp-3-1 mr-tmp-4-1 mr-tmp-5-1 mr-tmp-6-1 mr-tmp-7-1 mr-tmp-8-1] 1 0} 生成
2024/08/14 09:25:59 {11 [mr-tmp-1-2 mr-tmp-2-2 mr-tmp-3-2 mr-tmp-4-2 mr-tmp-5-2 mr-tmp-6-2 mr-tmp-7-2 mr-tmp-8-2] 1 0} 生成
2024/08/14 09:25:59 {12 [mr-tmp-1-3 mr-tmp-2-3 mr-tmp-3-3 mr-tmp-4-3 mr-tmp-5-3 mr-tmp-6-3 mr-tmp-7-3 mr-tmp-8-3] 1 0} 生成
2024/08/14 09:25:59 {13 [mr-tmp-1-4 mr-tmp-2-4 mr-tmp-3-4 mr-tmp-4-4 mr-tmp-5-4 mr-tmp-6-4 mr-tmp-7-4 mr-tmp-8-4] 1 0} 生成
2024/08/14 09:25:59 {14 [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1 0} 生成
2024/08/14 09:25:59 {15 [mr-tmp-1-6 mr-tmp-2-6 mr-tmp-3-6 mr-tmp-4-6 mr-tmp-5-6 mr-tmp-6-6 mr-tmp-7-6 mr-tmp-8-6] 1 0} 生成
2024/08/14 09:25:59 {16 [mr-tmp-1-7 mr-tmp-2-7 mr-tmp-3-7 mr-tmp-4-7 mr-tmp-5-7 mr-tmp-6-7 mr-tmp-7-7 mr-tmp-8-7] 1 0} 生成
2024/08/14 09:25:59 {17 [mr-tmp-1-8 mr-tmp-2-8 mr-tmp-3-8 mr-tmp-4-8 mr-tmp-5-8 mr-tmp-6-8 mr-tmp-7-8 mr-tmp-8-8] 1 0} 生成
2024/08/14 09:25:59 {18 [mr-tmp-1-9 mr-tmp-2-9 mr-tmp-3-9 mr-tmp-4-9 mr-tmp-5-9 mr-tmp-6-9 mr-tmp-7-9 mr-tmp-8-9] 1 0} 生成
--- map parallelism test: PASS
*** Starting reduce parallelism test.
2024/08/14 09:26:02 {1 [../pg-being_ernest.txt] 0 10} 生成
2024/08/14 09:26:02 {2 [../pg-dorian_gray.txt] 0 10} 生成
2024/08/14 09:26:02 {3 [../pg-frankenstein.txt] 0 10} 生成
2024/08/14 09:26:02 {4 [../pg-grimm.txt] 0 10} 生成
2024/08/14 09:26:02 {5 [../pg-huckleberry_finn.txt] 0 10} 生成
2024/08/14 09:26:02 {6 [../pg-metamorphosis.txt] 0 10} 生成
2024/08/14 09:26:02 {7 [../pg-sherlock_holmes.txt] 0 10} 生成
2024/08/14 09:26:02 {8 [../pg-tom_sawyer.txt] 0 10} 生成
2024/08/14 09:26:03 {9 [mr-tmp-1-0 mr-tmp-2-0 mr-tmp-3-0 mr-tmp-4-0 mr-tmp-5-0 mr-tmp-6-0 mr-tmp-7-0 mr-tmp-8-0] 1 0} 生成
2024/08/14 09:26:03 {10 [mr-tmp-1-1 mr-tmp-2-1 mr-tmp-3-1 mr-tmp-4-1 mr-tmp-5-1 mr-tmp-6-1 mr-tmp-7-1 mr-tmp-8-1] 1 0} 生成
2024/08/14 09:26:03 {11 [mr-tmp-1-2 mr-tmp-2-2 mr-tmp-3-2 mr-tmp-4-2 mr-tmp-5-2 mr-tmp-6-2 mr-tmp-7-2 mr-tmp-8-2] 1 0} 生成
2024/08/14 09:26:03 {12 [mr-tmp-1-3 mr-tmp-2-3 mr-tmp-3-3 mr-tmp-4-3 mr-tmp-5-3 mr-tmp-6-3 mr-tmp-7-3 mr-tmp-8-3] 1 0} 生成
2024/08/14 09:26:03 {13 [mr-tmp-1-4 mr-tmp-2-4 mr-tmp-3-4 mr-tmp-4-4 mr-tmp-5-4 mr-tmp-6-4 mr-tmp-7-4 mr-tmp-8-4] 1 0} 生成
2024/08/14 09:26:03 {14 [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1 0} 生成
2024/08/14 09:26:03 {15 [mr-tmp-1-6 mr-tmp-2-6 mr-tmp-3-6 mr-tmp-4-6 mr-tmp-5-6 mr-tmp-6-6 mr-tmp-7-6 mr-tmp-8-6] 1 0} 生成
2024/08/14 09:26:03 {16 [mr-tmp-1-7 mr-tmp-2-7 mr-tmp-3-7 mr-tmp-4-7 mr-tmp-5-7 mr-tmp-6-7 mr-tmp-7-7 mr-tmp-8-7] 1 0} 生成
2024/08/14 09:26:03 {17 [mr-tmp-1-8 mr-tmp-2-8 mr-tmp-3-8 mr-tmp-4-8 mr-tmp-5-8 mr-tmp-6-8 mr-tmp-7-8 mr-tmp-8-8] 1 0} 生成
2024/08/14 09:26:03 {18 [mr-tmp-1-9 mr-tmp-2-9 mr-tmp-3-9 mr-tmp-4-9 mr-tmp-5-9 mr-tmp-6-9 mr-tmp-7-9 mr-tmp-8-9] 1 0} 生成
--- reduce parallelism test: PASS
*** Starting job count test.
2024/08/14 09:26:12 {1 [../pg-being_ernest.txt] 0 10} 生成
2024/08/14 09:26:12 {2 [../pg-dorian_gray.txt] 0 10} 生成
2024/08/14 09:26:12 {3 [../pg-frankenstein.txt] 0 10} 生成
2024/08/14 09:26:12 {4 [../pg-grimm.txt] 0 10} 生成
2024/08/14 09:26:12 {5 [../pg-huckleberry_finn.txt] 0 10} 生成
2024/08/14 09:26:12 {6 [../pg-metamorphosis.txt] 0 10} 生成
2024/08/14 09:26:12 {7 [../pg-sherlock_holmes.txt] 0 10} 生成
2024/08/14 09:26:12 {8 [../pg-tom_sawyer.txt] 0 10} 生成
2024/08/14 09:26:26 {9 [mr-tmp-1-0 mr-tmp-2-0 mr-tmp-3-0 mr-tmp-4-0 mr-tmp-5-0 mr-tmp-6-0 mr-tmp-7-0 mr-tmp-8-0] 1 0} 生成
2024/08/14 09:26:26 {10 [mr-tmp-1-1 mr-tmp-2-1 mr-tmp-3-1 mr-tmp-4-1 mr-tmp-5-1 mr-tmp-6-1 mr-tmp-7-1 mr-tmp-8-1] 1 0} 生成
2024/08/14 09:26:26 {11 [mr-tmp-1-2 mr-tmp-2-2 mr-tmp-3-2 mr-tmp-4-2 mr-tmp-5-2 mr-tmp-6-2 mr-tmp-7-2 mr-tmp-8-2] 1 0} 生成
2024/08/14 09:26:26 {12 [mr-tmp-1-3 mr-tmp-2-3 mr-tmp-3-3 mr-tmp-4-3 mr-tmp-5-3 mr-tmp-6-3 mr-tmp-7-3 mr-tmp-8-3] 1 0} 生成
2024/08/14 09:26:26 {13 [mr-tmp-1-4 mr-tmp-2-4 mr-tmp-3-4 mr-tmp-4-4 mr-tmp-5-4 mr-tmp-6-4 mr-tmp-7-4 mr-tmp-8-4] 1 0} 生成
2024/08/14 09:26:26 {14 [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1 0} 生成
2024/08/14 09:26:26 {15 [mr-tmp-1-6 mr-tmp-2-6 mr-tmp-3-6 mr-tmp-4-6 mr-tmp-5-6 mr-tmp-6-6 mr-tmp-7-6 mr-tmp-8-6] 1 0} 生成
2024/08/14 09:26:26 {16 [mr-tmp-1-7 mr-tmp-2-7 mr-tmp-3-7 mr-tmp-4-7 mr-tmp-5-7 mr-tmp-6-7 mr-tmp-7-7 mr-tmp-8-7] 1 0} 生成
2024/08/14 09:26:26 {17 [mr-tmp-1-8 mr-tmp-2-8 mr-tmp-3-8 mr-tmp-4-8 mr-tmp-5-8 mr-tmp-6-8 mr-tmp-7-8 mr-tmp-8-8] 1 0} 生成
2024/08/14 09:26:26 {18 [mr-tmp-1-9 mr-tmp-2-9 mr-tmp-3-9 mr-tmp-4-9 mr-tmp-5-9 mr-tmp-6-9 mr-tmp-7-9 mr-tmp-8-9] 1 0} 生成
--- job count test: PASS
*** Starting early exit test.
2024/08/14 09:26:29 {1 [../pg-being_ernest.txt] 0 10} 生成
2024/08/14 09:26:29 {2 [../pg-dorian_gray.txt] 0 10} 生成
2024/08/14 09:26:29 {3 [../pg-frankenstein.txt] 0 10} 生成
2024/08/14 09:26:29 {4 [../pg-grimm.txt] 0 10} 生成
2024/08/14 09:26:29 {5 [../pg-huckleberry_finn.txt] 0 10} 生成
2024/08/14 09:26:29 {6 [../pg-metamorphosis.txt] 0 10} 生成
2024/08/14 09:26:29 {7 [../pg-sherlock_holmes.txt] 0 10} 生成
2024/08/14 09:26:29 {8 [../pg-tom_sawyer.txt] 0 10} 生成
2024/08/14 09:26:31 {9 [mr-tmp-1-0 mr-tmp-2-0 mr-tmp-3-0 mr-tmp-4-0 mr-tmp-5-0 mr-tmp-6-0 mr-tmp-7-0 mr-tmp-8-0] 1 0} 生成
2024/08/14 09:26:31 {10 [mr-tmp-1-1 mr-tmp-2-1 mr-tmp-3-1 mr-tmp-4-1 mr-tmp-5-1 mr-tmp-6-1 mr-tmp-7-1 mr-tmp-8-1] 1 0} 生成
2024/08/14 09:26:31 {11 [mr-tmp-1-2 mr-tmp-2-2 mr-tmp-3-2 mr-tmp-4-2 mr-tmp-5-2 mr-tmp-6-2 mr-tmp-7-2 mr-tmp-8-2] 1 0} 生成
2024/08/14 09:26:31 {12 [mr-tmp-1-3 mr-tmp-2-3 mr-tmp-3-3 mr-tmp-4-3 mr-tmp-5-3 mr-tmp-6-3 mr-tmp-7-3 mr-tmp-8-3] 1 0} 生成
2024/08/14 09:26:31 {13 [mr-tmp-1-4 mr-tmp-2-4 mr-tmp-3-4 mr-tmp-4-4 mr-tmp-5-4 mr-tmp-6-4 mr-tmp-7-4 mr-tmp-8-4] 1 0} 生成
2024/08/14 09:26:31 {14 [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1 0} 生成
2024/08/14 09:26:31 {15 [mr-tmp-1-6 mr-tmp-2-6 mr-tmp-3-6 mr-tmp-4-6 mr-tmp-5-6 mr-tmp-6-6 mr-tmp-7-6 mr-tmp-8-6] 1 0} 生成
2024/08/14 09:26:31 {16 [mr-tmp-1-7 mr-tmp-2-7 mr-tmp-3-7 mr-tmp-4-7 mr-tmp-5-7 mr-tmp-6-7 mr-tmp-7-7 mr-tmp-8-7] 1 0} 生成
2024/08/14 09:26:31 {17 [mr-tmp-1-8 mr-tmp-2-8 mr-tmp-3-8 mr-tmp-4-8 mr-tmp-5-8 mr-tmp-6-8 mr-tmp-7-8 mr-tmp-8-8] 1 0} 生成
2024/08/14 09:26:31 {18 [mr-tmp-1-9 mr-tmp-2-9 mr-tmp-3-9 mr-tmp-4-9 mr-tmp-5-9 mr-tmp-6-9 mr-tmp-7-9 mr-tmp-8-9] 1 0} 生成
--- early exit test: PASS
*** Starting crash test.
2024/08/14 09:26:39 {1 [../pg-being_ernest.txt] 0 10} 生成
2024/08/14 09:26:39 {2 [../pg-dorian_gray.txt] 0 10} 生成
2024/08/14 09:26:39 {3 [../pg-frankenstein.txt] 0 10} 生成
2024/08/14 09:26:39 {4 [../pg-grimm.txt] 0 10} 生成
2024/08/14 09:26:39 {5 [../pg-huckleberry_finn.txt] 0 10} 生成
2024/08/14 09:26:39 {6 [../pg-metamorphosis.txt] 0 10} 生成
2024/08/14 09:26:39 {7 [../pg-sherlock_holmes.txt] 0 10} 生成
2024/08/14 09:26:39 {8 [../pg-tom_sawyer.txt] 0 10} 生成
1 10.681316542s [../pg-being_ernest.txt] 0
8 10.242058125s [../pg-tom_sawyer.txt] 0
2024/08/14 09:26:53 {9 [mr-tmp-1-0 mr-tmp-2-0 mr-tmp-3-0 mr-tmp-4-0 mr-tmp-5-0 mr-tmp-6-0 mr-tmp-7-0 mr-tmp-8-0] 1 0} 生成
2024/08/14 09:26:53 {10 [mr-tmp-1-1 mr-tmp-2-1 mr-tmp-3-1 mr-tmp-4-1 mr-tmp-5-1 mr-tmp-6-1 mr-tmp-7-1 mr-tmp-8-1] 1 0} 生成
2024/08/14 09:26:53 {11 [mr-tmp-1-2 mr-tmp-2-2 mr-tmp-3-2 mr-tmp-4-2 mr-tmp-5-2 mr-tmp-6-2 mr-tmp-7-2 mr-tmp-8-2] 1 0} 生成
2024/08/14 09:26:53 {12 [mr-tmp-1-3 mr-tmp-2-3 mr-tmp-3-3 mr-tmp-4-3 mr-tmp-5-3 mr-tmp-6-3 mr-tmp-7-3 mr-tmp-8-3] 1 0} 生成
2024/08/14 09:26:53 {13 [mr-tmp-1-4 mr-tmp-2-4 mr-tmp-3-4 mr-tmp-4-4 mr-tmp-5-4 mr-tmp-6-4 mr-tmp-7-4 mr-tmp-8-4] 1 0} 生成
2024/08/14 09:26:53 {14 [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1 0} 生成
2024/08/14 09:26:53 {15 [mr-tmp-1-6 mr-tmp-2-6 mr-tmp-3-6 mr-tmp-4-6 mr-tmp-5-6 mr-tmp-6-6 mr-tmp-7-6 mr-tmp-8-6] 1 0} 生成
2024/08/14 09:26:53 {16 [mr-tmp-1-7 mr-tmp-2-7 mr-tmp-3-7 mr-tmp-4-7 mr-tmp-5-7 mr-tmp-6-7 mr-tmp-7-7 mr-tmp-8-7] 1 0} 生成
2024/08/14 09:26:53 {17 [mr-tmp-1-8 mr-tmp-2-8 mr-tmp-3-8 mr-tmp-4-8 mr-tmp-5-8 mr-tmp-6-8 mr-tmp-7-8 mr-tmp-8-8] 1 0} 生成
2024/08/14 09:26:53 {18 [mr-tmp-1-9 mr-tmp-2-9 mr-tmp-3-9 mr-tmp-4-9 mr-tmp-5-9 mr-tmp-6-9 mr-tmp-7-9 mr-tmp-8-9] 1 0} 生成
14 9.146472209s [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1
14 9.889676708s [mr-tmp-1-5 mr-tmp-2-5 mr-tmp-3-5 mr-tmp-4-5 mr-tmp-5-5 mr-tmp-6-5 mr-tmp-7-5 mr-tmp-8-5] 1
--- crash test: PASS
*** PASSED ALL TESTS
```


## 关于Crash测试


```go
func maybeCrash() {
	max := big.NewInt(1000)
	rr, _ := crand.Int(crand.Reader, max)
	if rr.Int64() < 330 {
		// crash!
		os.Exit(1)
	} else if rr.Int64() < 660 {
		// delay for a while.
		maxms := big.NewInt(10 * 1000)
		ms, _ := crand.Int(crand.Reader, maxms)
		time.Sleep(time.Duration(ms.Int64()) * time.Millisecond)
	}
}

func Map(filename string, contents string) []mr.KeyValue {
	maybeCrash()

	kva := []mr.KeyValue{}
	kva = append(kva, mr.KeyValue{"a", filename})
	kva = append(kva, mr.KeyValue{"b", strconv.Itoa(len(filename))})
	kva = append(kva, mr.KeyValue{"c", strconv.Itoa(len(contents))})
	kva = append(kva, mr.KeyValue{"d", "xyzzy"})
	return kva
}

func Reduce(key string, values []string) string {
	maybeCrash()

	// sort values to ensure deterministic output.
	vv := make([]string, len(values))
	copy(vv, values)
	sort.Strings(vv)

	val := strings.Join(vv, " ")
	return val
}
```


有三分之一概率正常执行，三分之一概率直接崩溃，三分之一概率延迟几秒再执行

