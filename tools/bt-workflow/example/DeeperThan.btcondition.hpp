#pragma once
#include "riptide_autonomy/autonomy_lib.hpp"

using nav_msgs::msg::Odometry;

// SUCCESS while Talos is deeper than `z`
// (odometry z: 0 at the surface, negative
// below). FAILURE before any odometry, or
// when the newest is older than
// `max_age_secs`.
class DeeperThan
  : public UWRTConditionNode {
public:
  DeeperThan(const std::string& name,
    const BT::NodeConfiguration& config)
    : UWRTConditionNode(name, config) { }

  static BT::PortsList providedPorts() {
    return {
      UwrtInput("z", "Succeed while "
        "odometry z is below this "
        "(m, negative underwater)"),
      UwrtInput("max_age_secs", "Fail if "
        "the newest odometry is older "
        "than this (default 0.5)")
    };
  }

  void rosInit() override {
    auto onOdom =
      [this](Odometry::SharedPtr msg) {
        lastZ = msg->pose.pose.position.z;
        lastStamp = rosNode()->now();
        haveOdom = true;
      };
    odomSub = rosNode()->
      create_subscription<Odometry>(
        ODOMETRY_TOPIC, 10, onOdom);
  }

  BT::NodeStatus tick() override {
    auto z = tryGetRequiredInput<double>(
      this, "z", 0.0);
    auto maxAge =
      tryGetOptionalInput<double>(
        this, "max_age_secs", 0.5);
    bool stale = !haveOdom ||
      (rosNode()->now() - lastStamp)
        .seconds() > maxAge;
    if(stale) {
      return BT::NodeStatus::FAILURE;
    }
    return lastZ < z
      ? BT::NodeStatus::SUCCESS
      : BT::NodeStatus::FAILURE;
  }

private:
  bool haveOdom = false;
  double lastZ = 0;
  rclcpp::Time lastStamp;
  rclcpp::Subscription<Odometry>::SharedPtr
    odomSub;
};
